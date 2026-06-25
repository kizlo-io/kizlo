<?php

namespace Kizlo\Modules\Settings\Taxonomy;

/**
 * Collection of TaxonomySettings instances keyed by taxonomy slug.
 *
 * @since 1.0.0
 */
class TaxonomySettingsCollection
{
    /** @var array<string, TaxonomySettings> */
    private array $items;

    /**
     * @param array<string, TaxonomySettings> $items
     */
    public function __construct(array $items)
    {
        $this->items = $items;
    }

    /**
     * Get settings for a specific taxonomy by slug.
     *
     * @param  string $slug Taxonomy slug.
     * @return TaxonomySettings
     */
    public function get(string $slug): TaxonomySettings
    {
        return $this->items[$slug] ?? new TaxonomySettings();
    }

    /**
     * Get all taxonomy settings instances.
     *
     * @return array<string, TaxonomySettings>
     */
    public function all(): array
    {
        return $this->items;
    }
}
