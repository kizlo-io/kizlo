<?php

namespace Kizlo\Modules\Taxonomy;

use WP_Term;
use Kizlo\Support\Utils;
use Kizlo\Modules\Seo\TermSchema;
use Kizlo\Modules\CustomFields\CustomFieldsStore;

/** Adds the enhanced Kizlo payload used by the managed taxonomy routes. */
final class TaxonomyExtension
{
    public function extendSingle(array $data, ?WP_Term $term = null): array
    {
        $term = $term ?? $this->term($data);
        $custom = $data['kizlo']['custom'] ?? null;

        if (!$term) {
            return $this->groupCustomFields($data, null);
        }

        $extend        = $data['kizlo']['extend'] ?? [];
        $settings      = Utils::getSettings();
        $termSeo       = new TermSchema($settings);
        $data['kizlo'] = array_merge(
            [
                'seo' => [
                    'head'   => $termSeo->buildMeta($term),
                    'schema' => $termSeo->jsonLd($term),
                ],
            ],
            $this->extendBase($term),
            ['extend' => $extend],
        );

        if ($custom !== null) {
            $data['kizlo']['custom'] = $custom;
            return $data;
        }

        return $this->groupCustomFields($data, $term);
    }

    public function extendListItem(array $data): array
    {
        $term = $this->term($data);
        $custom = $data['kizlo']['custom'] ?? null;

        if (!$term) {
            return $this->groupCustomFields($data, null);
        }

        $extend        = $data['kizlo']['extend'] ?? [];
        $data['kizlo'] = $this->extendBase($term) + ['extend' => $extend];

        if ($custom !== null) {
            $data['kizlo']['custom'] = $custom;
            return $data;
        }

        return $this->groupCustomFields($data, $term);
    }

    private function term(array $data): ?WP_Term
    {
        $term = get_term((int) ($data['id'] ?? 0));

        return $term instanceof WP_Term ? $term : null;
    }

    /**
     * @return array{id: int, name: string, slug: string, description: string, parent: int, count: int, url: string}
     */
    private function extendBase(WP_Term $term): array
    {
        $settings = Utils::getSettings();
        $taxonomy = $settings->taxonomies->get($term->taxonomy);

        return [
            'id'          => $term->term_id,
            'name'        => $term->name,
            'slug'        => $term->slug,
            'description' => $term->description,
            'parent'      => $term->parent,
            'count'       => $term->count,
            'url'         => $settings->resolveTermUrl($term, $taxonomy),
        ];
    }

    private function groupCustomFields(array $data, ?WP_Term $term): array
    {
        if (!$term) {
            $data['kizlo']['custom'] = (object) [];
            return $data;
        }

        $definitions = Utils::getSettings()->taxonomies->get($term->taxonomy)->getCustomFields();
        $custom      = CustomFieldsStore::read(CustomFieldsStore::META_TERM, $term->term_id, $definitions);
        $custom      = apply_filters('kizlo_taxonomy_custom_values', $custom, $term);

        $data['kizlo']['custom'] = (object) $custom;

        return $data;
    }
}
