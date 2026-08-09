<?php

namespace Kizlo\Modules\Introspection;

/**
 * Backing store for the two public registration helpers.
 *
 * `kizlo_register_spec_schema()` and `kizlo_register_spec_route()` contribute
 * through the `kizlo_introspection_schemas` / `kizlo_introspection_routes`
 * filters like anyone else. What the store adds is provenance: it fingerprints
 * everything registered from inside the Kizlo plugin, which is how the registry
 * later tells a core registration into `kizlo.*` from a third-party one.
 */
class SpecStore
{
    /** @var array<int, array{id: string, schema: array<string, mixed>}> */
    private static array $schemas = [];

    /** @var array<int, array<string, mixed>> */
    private static array $routes = [];

    /** @var array<string, true> Fingerprints of entries registered from inside the plugin. */
    private static array $trusted = [];

    /** @var array<int, array{location: array<string, string>, message: string}> */
    private static array $errors = [];

    private static bool $hooked = false;

    /**
     * @param array<string, mixed> $schema
     */
    public static function addSchema(string $id, array $schema, bool $trusted): void
    {
        self::hook();

        $entry = ['id' => $id, 'schema' => $schema];

        self::$schemas[] = $entry;

        if ($trusted) {
            self::$trusted[self::fingerprint('schema', $entry)] = true;
        }
    }

    /**
     * @param array<string, mixed> $operation A normalized operation.
     */
    public static function addRoute(array $operation, bool $trusted): void
    {
        self::hook();

        self::$routes[] = $operation;

        if ($trusted) {
            self::$trusted[self::fingerprint('route', $operation)] = true;
        }
    }

    /**
     * Record a failure raised at registration time, so `/introspect` reports it
     * alongside everything the registry finds rather than swallowing it.
     *
     * @param array<string, string> $location
     */
    public static function addError(array $location, string $message): void
    {
        self::$errors[] = ['location' => $location, 'message' => $message];
    }

    /**
     * @param array{id: string, schema: array<string, mixed>}|array<string, mixed> $entry
     */
    public static function isTrusted(string $kind, array $entry): bool
    {
        return isset(self::$trusted[self::fingerprint($kind, $entry)]);
    }

    public static function applyDiagnostics(Diagnostics $diagnostics): void
    {
        foreach (self::$errors as $error) {
            $diagnostics->error($error['location'], $error['message']);
        }
    }

    /**
     * Test seam: the store is process-global, and the collection filters are
     * dropped when WordPress restores its hooks between tests, so the "already
     * hooked" flag has to go with them.
     */
    public static function reset(): void
    {
        self::$schemas = [];
        self::$routes  = [];
        self::$trusted = [];
        self::$errors  = [];
        self::$hooked  = false;
    }

    /**
     * A file in the plugin's own source tree is core; anything else is a
     * third-party contribution and cannot claim a reserved ID prefix.
     *
     * Scoped to `src/` rather than the plugin root so the rule is exactly "code
     * this plugin ships", which also leaves the test suite on the third-party
     * side of the boundary it is testing.
     */
    public static function isCoreFile(mixed $file): bool
    {
        if (!is_string($file) || $file === '' || !defined('KIZLO_PATH')) {
            return false;
        }

        return str_starts_with(wp_normalize_path($file), wp_normalize_path(KIZLO_PATH . 'src/'));
    }

    /** True when the caller of the calling function sits inside the Kizlo plugin. */
    public static function callerIsCore(): bool
    {
        $frames = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2);

        return self::isCoreFile($frames[1]['file'] ?? null);
    }

    private static function hook(): void
    {
        if (self::$hooked) {
            return;
        }

        self::$hooked = true;

        add_filter('kizlo_introspection_schemas', static function (array $schemas): array {
            return array_merge($schemas, self::$schemas);
        });

        add_filter('kizlo_introspection_routes', static function (array $routes): array {
            return array_merge($routes, self::$routes);
        });
    }

    /**
     * @param array<string, mixed> $entry
     */
    private static function fingerprint(string $kind, array $entry): string
    {
        return hash('sha256', $kind . '|' . Document::encode($entry));
    }
}
