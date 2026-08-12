<?php

namespace Kizlo\Modules\Introspection;

/**
 * Managed post type and taxonomy contributions.
 *
 * These are rebuilt from current settings on every request rather than stored,
 * so the contract follows a supports toggle, a new custom field or a changed
 * taxonomy connection immediately. The cost is bounded by the settings cache the
 * rest of the plugin already reads through.
 *
 * Memoized per request because runtime argument translation and the document
 * build both ask for the same thing.
 */
class ManagedContent
{
    /** @var array<string, array<string, mixed>>|null */
    private static ?array $schemas = null;

    /** @var array<int, array<string, mixed>>|null */
    private static ?array $routes = null;

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function schemas(): array
    {
        return self::$schemas ??= ManagedPostTypes::schemas() + ManagedTaxonomies::schemas();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function routes(): array
    {
        return self::$routes ??= array_merge(ManagedPostTypes::routes(), ManagedTaxonomies::routes());
    }

    public static function flush(): void
    {
        self::$schemas = null;
        self::$routes  = null;

        CoreCollectionParams::flush();
        CoreItemSchema::flush();
        CoreSchemas::flush();
        Registry::flush();
    }
}
