<?php

namespace Kizlo\Modules\Settings;

/**
 * Manages transient caching for plugin settings.
 *
 * @since 1.0.0
 */
class SettingsCache
{
    private const KEY = 'kizlo_settings_cache';

    /**
     * Retrieve cached settings data.
     *
     * @return array<string, mixed>|false False if cache is empty or expired.
     */
    public static function get(): array|false
    {
        return get_transient(self::KEY);
    }

    /**
     * Store settings data in transient cache.
     *
     * @param array<string, mixed> $data
     */
    public static function set(array $data): void
    {
        set_transient(self::KEY, $data, DAY_IN_SECONDS);
    }

    /**
     * Invalidate the settings transient cache.
     *
     * The optional arguments make this method usable directly as the callback for
     * WordPress's plugin activation and deactivation actions. Every plugin change
     * invalidates the cache because whether it contributes a managed object is only
     * knowable after the next request has registered the complete object set.
     */
    public static function invalidate(string $plugin = '', bool $network_wide = false): void
    {
        delete_transient(self::KEY);
    }
}
