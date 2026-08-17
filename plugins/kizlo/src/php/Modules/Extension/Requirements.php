<?php

namespace Kizlo\Modules\Extension;

/**
 * Reads the `Kizlo Requires` header off a plugin file.
 *
 * WordPress declares its own preconditions in headers (`Requires PHP`,
 * `Requires at least`, `Requires Plugins`), so this one sits with them and is
 * readable without running any of the plugin's code. `Requires Plugins` already
 * says which plugins have to be active and WordPress enforces that on
 * activation; this says how new each of them has to be, which is the half
 * WordPress has no header for.
 */
final class Requirements
{
    public const HEADER = 'Kizlo Requires';

    /**
     * @return array<int, Requirement>
     */
    public static function read(string $file): array
    {
        $data   = get_file_data($file, ['requires' => self::HEADER]);
        $header = trim($data['requires']);

        if ($header === '') return [];

        $entries = array_filter(array_map('trim', explode(',', $header)), static fn(string $entry): bool => $entry !== '');

        return array_values(array_map(static fn(string $entry): Requirement => Requirement::parse($entry), $entries));
    }

    /**
     * @param  array<int, Requirement> $requirements
     * @return array<int, Requirement>
     */
    public static function unmet(array $requirements): array
    {
        return array_values(array_filter($requirements, static fn(Requirement $requirement): bool => !$requirement->isMet()));
    }
}
