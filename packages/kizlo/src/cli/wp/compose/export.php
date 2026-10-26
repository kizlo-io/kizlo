<?php
// Run in the existing wp-cli image; only read the effective mounted content tree.
set_error_handler(static function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

try {
    [$script, $workspace, $content] = $argv;
    if (!class_exists('PharData') || !Phar::canCompress(Phar::GZ)) {
        throw new RuntimeException('The PHP image needs PharData ZIP and zlib support.');
    }
    $sql = "$workspace/database.sql";
    if (!is_file($sql) || filesize($sql) === 0) {
        throw new RuntimeException('The database dump is empty or missing.');
    }
    $root = realpath($content);
    if ($root === false || !is_dir($root) || is_link($content)) {
        throw new RuntimeException('The wp-content directory is missing or is a link outside the install.');
    }
    $directories = ['wp-content'];
    $total = filesize($sql);
    $entryCount = 3;
    $files = function ($directory, $entry, $ancestors = []) use (&$files, &$directories, &$total, &$entryCount, $root): Generator {
        $real = realpath($directory);
        if ($real === false || ($real !== $root && !str_starts_with($real, "$root/"))) {
            throw new RuntimeException("Content link escapes wp-content: $entry");
        }
        if (isset($ancestors[$real])) {
            throw new RuntimeException("Content contains a directory link cycle: $entry");
        }
        $ancestors[$real] = true;
        foreach (new DirectoryIterator($directory) as $file) {
            if ($file->isDot()) continue;
            if (++$entryCount > 65535) throw new RuntimeException('Export exceeds the PHP ZIP entry limit (65535).');
            $name = $file->getFilename();
            if (str_contains($name, '\\') || str_contains($name, ':')) {
                throw new RuntimeException("Content filename is unsafe in a portable ZIP: $entry/$name");
            }
            $path = $file->getPathname();
            $target = realpath($path);
            if ($target === false || ($target !== $root && !str_starts_with($target, "$root/"))) {
                throw new RuntimeException("Content link is broken or escapes wp-content: $entry/$name");
            }
            $key = "$entry/$name";
            if ($file->isDir()) {
                $directories[] = $key;
                yield from $files($path, $key, $ancestors);
            } elseif ($file->isFile() && is_readable($path)) {
                $total += filesize($path);
                // Phar ZIP has no ZIP64 support. Fail instead of publishing a truncated archive.
                if ($total > 0xffffffff) throw new RuntimeException('Export exceeds the PHP ZIP size limit (4 GiB).');
                yield $key => $path;
            } else {
                throw new RuntimeException("Content is unreadable or not a regular file: $key");
            }
        }
    };
    if ($total > 0xffffffff) throw new RuntimeException('SQL exceeds the PHP ZIP size limit (4 GiB).');
    $inner = new PharData("$workspace/database.sql.zip");
    $inner->buildFromIterator(new ArrayIterator(['database.sql' => $sql]));
    $inner->compressFiles(Phar::GZ);
    unset($inner);

    $entries = function () use ($workspace, $root, $files): Generator {
        yield 'database.sql.zip' => "$workspace/database.sql.zip";
        yield 'README.txt' => "$workspace/README.txt";
        yield from $files($root, 'wp-content');
    };
    $outer = new PharData("$workspace/site.zip");
    $outer->startBuffering();
    $outer->buildFromIterator($entries());
    foreach ($directories as $directory) $outer->addEmptyDir($directory);
    $outer->compressFiles(Phar::GZ);
    $outer->stopBuffering();
    unset($outer);
    if (!is_file("$workspace/site.zip") || filesize("$workspace/site.zip") === 0 || filesize("$workspace/site.zip") > 0xffffffff) {
        throw new RuntimeException('PHP did not produce an export ZIP.');
    }
} catch (Throwable $error) {
    fwrite(STDERR, 'Export ZIP failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
