<?php

namespace Kizlo\Modules\Settings\Taxonomy;

use WP_Taxonomy;
use Kizlo\Modules\Settings\SettingsIndexedAbstract;

class TaxonomySettings extends SettingsIndexedAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_taxonomies';

    protected array $data = [
        'pathname_structure'       => null,
        'title_structure'          => null,
        'description_structure'    => null,
        'search_engine_visibility' => null,
        'seo_enabled'              => null,
        'rest_api_enabled'         => true,
    ];

    protected const INTERNAL_TAXONOMIES = [
        'category' => ['seo_enabled' => true],
        'post_tag' => ['seo_enabled' => true],
    ];

    private static function internalTaxonomies(): array
    {
        static $cache = null;
        if ($cache === null) {
            $cache = apply_filters('kizlo_internal_taxonomies', self::INTERNAL_TAXONOMIES);
        }
        return $cache;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'seo_enabled',
            'rest_api_enabled',
            'search_engine_visibility' => (bool) $value,

            'pathname_structure',
            'title_structure',
            'description_structure'    => !empty($value) ? sanitize_text_field($value) : null,

            default                    => $value,
        };
    }

    public static function load(string $id): static
    {
        $instance = parent::load($id);

        foreach (self::internalTaxonomies()[$id] ?? [] as $key => $default_value) {
            if (array_key_exists($key, $instance->data) && $instance->data[$key] === null) {
                $instance->data[$key] = $default_value;
            }
        }

        return $instance;
    }

    /**
     * The URL pathname structure for this taxonomy, supporting variable placeholders (e.g. /categories/{{slug}}).
     */
    public function getPathnameStructure(): ?string
    {
        return $this->get('pathname_structure');
    }

    /** @param string|null $value Pathname structure or null to clear. */
    public function setPathnameStructure(?string $value): static
    {
        $this->set('pathname_structure', $value);
        return $this;
    }

    /**
     * The SEO title structure for this taxonomy, supporting variable placeholders.
     */
    public function getTitleStructure(): ?string
    {
        return $this->get('title_structure');
    }

    /** @param string|null $value Title structure or null to clear. */
    public function setTitleStructure(?string $value): static
    {
        $this->set('title_structure', $value);
        return $this;
    }

    /**
     * The SEO description structure for this taxonomy, supporting variable placeholders.
     */
    public function getDescriptionStructure(): ?string
    {
        return $this->get('description_structure');
    }

    /** @param string|null $value Description structure or null to clear. */
    public function setDescriptionStructure(?string $value): static
    {
        $this->set('description_structure', $value);
        return $this;
    }

    /**
     * Whether this taxonomy is visible to search engines.
     * Defaults to true.
     */
    public function getSearchEngineVisibility(): bool
    {
        return (bool) $this->get('search_engine_visibility');
    }

    /** @param bool $value True to allow indexing, false to block. */
    public function setSearchEngineVisibility(bool $value): static
    {
        $this->set('search_engine_visibility', $value);
        return $this;
    }

    /**
     * Whether this taxonomy is accessible via the Kizlo API.
     */
    public function getAccessEnabled(): bool
    {
        return (bool) $this->get('rest_api_enabled');
    }

    /** @param bool $value True to enable, false to disable. */
    public function setAccessEnabled(bool $value): static
    {
        $this->set('rest_api_enabled', $value);
        return $this;
    }

    /**
     * Whether SEO settings are enabled for this taxonomy.
     */
    public function getSeoEnabled(): bool
    {
        return (bool) $this->get('seo_enabled');
    }

    /** @param bool $value True to enable, false to disable. */
    public function setSeoEnabled(bool $value): static
    {
        $this->set('seo_enabled', $value);
        return $this;
    }

    /**
     * Checks if taxonomy is internal or not.
     * 
     * @param string $taxonomy
     * @return bool
     */
    public static function checkInternal(string $taxonomy): bool
    {
        return array_key_exists($taxonomy, self::internalTaxonomies());
    }

    /**
     * Returns all taxonomies available in Kizlo.
     *
     * Merges WordPress registered taxonomies (show_in_rest: true) with
     * explicitly included ones via kizlo_include_taxonomy(). Items in
     * the exclusion list can be overridden per item by explicitly including them.
     *
     * @return WP_Taxonomy[]
     */
    public static function getAvailableObjects(): array
    {
        $defaults      = array_keys(self::internalTaxonomies());
        $included      = apply_filters('kizlo_included_taxonomies', []);
        $allowed       = array_unique(array_merge($defaults, $included));
        $wp_taxonomies = get_taxonomies([], 'objects');

        $available = [];

        foreach ($wp_taxonomies as $taxonomy => $object) {
            if (!$object->show_in_rest || !in_array($taxonomy, $allowed, true)) {
                continue;
            }
            $available[$taxonomy] = $object;
        }

        foreach ($included as $taxonomy) {
            if (!isset($available[$taxonomy]) && taxonomy_exists($taxonomy)) {
                $tax = get_taxonomy($taxonomy);
                if ($tax->show_in_rest) {
                    $available[$taxonomy] = $tax;
                }
            }
        }

        return $available;
    }
}
