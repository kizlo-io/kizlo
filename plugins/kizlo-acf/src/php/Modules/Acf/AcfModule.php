<?php

namespace Kizlo\Acf\Modules\Acf;

use WP_Post;
use WP_Term;

/**
 * Publishes ACF fields under `kizlo.custom.acf` on each managed object that has
 * ACF field groups.
 *
 * Core exposes two paired, ACF-agnostic hooks on the `custom` block: a schema
 * filter to describe a namespaced sub-object and a runtime filter to emit it.
 * This module fills the `acf` namespace on both, gathering an object's field
 * groups the same way in each so the description and the payload cannot drift. An
 * object with no groups is left untouched, so no `acf` key appears where nothing
 * declares it.
 */
class AcfModule
{
    public function register(): void
    {
        add_filter('kizlo_post_type_custom_schema', [$this, 'post_type_schema'], 10, 2);
        add_filter('kizlo_taxonomy_custom_schema', [$this, 'taxonomy_schema'], 10, 2);
        add_filter('kizlo_post_type_custom_values', [$this, 'post_type_values'], 10, 2);
        add_filter('kizlo_taxonomy_custom_values', [$this, 'term_values'], 10, 2);
    }

    /**
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    public function post_type_schema(array $properties, string $slug): array
    {
        return $this->schema($properties, ['post_type' => $slug]);
    }

    /**
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    public function taxonomy_schema(array $properties, string $slug): array
    {
        return $this->schema($properties, ['taxonomy' => $slug]);
    }

    /**
     * @param array<string, mixed> $custom
     * @return array<string, mixed>
     */
    public function post_type_values(array $custom, WP_Post $post): array
    {
        $fields = $this->fields(['post_type' => $post->post_type]);

        if ($fields === []) {
            return $custom;
        }

        $custom['acf'] = AcfValues::resolve($fields, $post->ID);

        return $custom;
    }

    /**
     * @param array<string, mixed> $custom
     * @return array<string, mixed>
     */
    public function term_values(array $custom, WP_Term $term): array
    {
        $fields = $this->fields(['taxonomy' => $term->taxonomy]);

        if ($fields === []) {
            return $custom;
        }

        // ACF addresses a term's meta by the `term_<id>` object id.
        $custom['acf'] = AcfValues::resolve($fields, "term_{$term->term_id}");

        return $custom;
    }

    /**
     * @param array<string, array<string, mixed>> $properties
     * @param array<string, string>               $location
     * @return array<string, array<string, mixed>>
     */
    private function schema(array $properties, array $location): array
    {
        $fields = $this->fields($location);

        if ($fields === []) {
            return $properties;
        }

        $properties['acf'] = AcfSchema::responseGroup($fields);

        return $properties;
    }

    /**
     * The field definitions of every ACF group attached to an object, flattened.
     *
     * Guarded on ACF's own functions so an install without ACF loaded resolves to
     * no fields rather than a fatal, which is what keeps the schema and runtime
     * filters harmless when the dependency is missing.
     *
     * @param array<string, string> $location
     * @return array<int, array<string, mixed>>
     */
    private function fields(array $location): array
    {
        if (!function_exists('acf_get_field_groups') || !function_exists('acf_get_fields')) {
            return [];
        }

        $fields = [];

        foreach (acf_get_field_groups($location) as $group) {
            $group_fields = acf_get_fields($group);

            if (!is_array($group_fields)) {
                continue;
            }

            foreach ($group_fields as $field) {
                $fields[] = $field;
            }
        }

        return $fields;
    }
}
