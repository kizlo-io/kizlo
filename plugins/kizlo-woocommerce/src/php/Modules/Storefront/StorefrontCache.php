<?php

namespace Kizlo\WooCommerce\Modules\Storefront;

/**
 * One transient holding the storefront payload per locale, because labels and
 * state names are translated. Keeping every locale in one entry is what lets a
 * settings change clear all of them at once.
 */
class StorefrontCache
{
    public const KEY = 'kizlo_woocommerce_storefront';

    public const GENERATION_OPTION = 'kizlo_woocommerce_storefront_generation';

    /** @return array<string, mixed>|null */
    public static function get(string $locale): ?array
    {
        $entries = get_transient(self::KEY);

        return is_array($entries) && is_array($entries[$locale] ?? null) ? $entries[$locale] : null;
    }

    /** @param array<string, mixed> $payload */
    public static function set(string $locale, array $payload): void
    {
        $entries          = get_transient(self::KEY);
        $entries          = is_array($entries) ? $entries : [];
        $entries[$locale] = $payload;

        set_transient(self::KEY, $entries, DAY_IN_SECONDS);
    }

    /** Bumped before every invalidation, so a build can tell one happened while it ran. */
    public static function invalidate(): void
    {
        update_option(self::GENERATION_OPTION, self::generation() + 1, false);
        delete_transient(self::KEY);
    }

    /**
     * Read from the table rather than through `get_option()`, whose per-request
     * cache would still hold the value from when this request started.
     */
    public static function generation(): int
    {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", self::GENERATION_OPTION),
        );
    }
}
