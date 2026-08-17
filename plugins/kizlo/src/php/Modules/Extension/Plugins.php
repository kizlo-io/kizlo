<?php

namespace Kizlo\Modules\Extension;

/**
 * What is active right now, by plugin slug.
 *
 * A requirement names a slug, and the running version behind that slug is what
 * decides whether the requirement holds. WordPress has no lookup for this that
 * is cheap enough to call on a front-end request: `get_plugins()` lives in
 * `wp-admin/includes/plugin.php` and reads every plugin header in the
 * directory. This reads one file per slug asked for, through `get_file_data()`
 * from `wp-includes`, and remembers the answer for the rest of the request.
 *
 * Only active plugins resolve. An installed but deactivated plugin is not
 * running, so nothing it declares can be depended on.
 */
final class Plugins
{
    /**
     * @var array<string, array{name: string, version: string}|null>
     */
    private static array $cache = [];

    /**
     * @return array{name: string, version: string}|null Null when no active plugin owns the slug.
     */
    public static function find(string $slug): ?array
    {
        if (array_key_exists($slug, self::$cache)) {
            return self::$cache[$slug];
        }

        $file = self::activeFile($slug);

        if ($file === null) {
            return self::$cache[$slug] = null;
        }

        $data = get_file_data(WP_PLUGIN_DIR . '/' . $file, ['name' => 'Plugin Name', 'version' => 'Version']);

        return self::$cache[$slug] = [
            'name'    => $data['name'] !== '' ? $data['name'] : $slug,
            'version' => $data['version'],
        ];
    }

    /**
     * Forget what was resolved. Test seam: the cache is per-request, and a test
     * changing which plugins are active is changing the answer mid-request.
     */
    public static function reset(): void
    {
        self::$cache = [];
    }

    /**
     * The plugin file an active plugin is registered under, e.g. `woocommerce/woocommerce.php`.
     *
     * Network-activated plugins are keyed by file in their own option and never
     * appear in `active_plugins`, so both are searched.
     */
    private static function activeFile(string $slug): ?string
    {
        $active = get_option('active_plugins', []);
        $active = is_array($active) ? $active : [];

        if (is_multisite()) {
            $network = get_site_option('active_sitewide_plugins', []);
            $active  = array_merge($active, is_array($network) ? array_keys($network) : []);
        }

        foreach ($active as $file) {
            if (!is_string($file)) continue;
            if ($file === $slug . '.php' || str_starts_with($file, $slug . '/')) return $file;
        }

        return null;
    }
}
