<?php

namespace Kizlo\Modules\Taxonomy;

use WP_Term;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Utils;
use Kizlo\Modules\Seo\TermSchema;
use Kizlo\Modules\CustomFields\CustomFieldsStore;

/**
 * Injects resolved SEO into the term REST responses the headless frontend reads,
 * mirroring {@see \Kizlo\Modules\Post\PostExtension} for posts.
 *
 * Hooks `rest_prepare_{taxonomy}` for every Kizlo-managed taxonomy (the same set
 * the term editor is registered on), so a single-term response carries the
 * resolved `head` meta + JSON-LD `schema` built from the taxonomy templates and
 * any per-term overrides. List responses carry only Kizlo's extension bags.
 */
class TermExtension
{
    public function register(): void
    {
        if (!did_action('rest_api_init')) {
            add_action('rest_api_init', [$this, 'bind'], PHP_INT_MAX);

            return;
        }

        $this->bind();
    }

    public function bind(): void
    {
        foreach (array_keys(Utils::getSettings()->taxonomies->all()) as $taxonomy) {
            add_filter("rest_prepare_{$taxonomy}", [$this, 'prepare'], PHP_INT_MAX, 3);
        }
    }

    public function prepare(WP_REST_Response | WP_Error $response, WP_Term $term, WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        $data = $request->get_param('id')
            ? $this->extendSingle($response->get_data(), $term)
            : $this->extendListItem($response->get_data(), $term);

        $definitions = Utils::getSettings()->taxonomies->get($term->taxonomy)->getCustomFields();
        $custom      = CustomFieldsStore::read(CustomFieldsStore::META_TERM, $term->term_id, $definitions);

        // Taxonomy counterpart of `kizlo_post_type_custom_values`; paired with
        // `kizlo_taxonomy_custom_schema`. No listener leaves the values untouched.
        $custom = apply_filters('kizlo_taxonomy_custom_values', $custom, $term);

        $data['kizlo']['custom'] = (object) $custom;

        $response->set_data($data);

        return $response;
    }

    public function extendSingle(array $data, WP_Term $term): array
    {
        $settings = Utils::getSettings();
        $kizlo    = kizlo_apply_extend_filter('term', $term);

        if ($settings->taxonomies->get($term->taxonomy)->getSeoEnabled()) {
            $term_seo = new TermSchema($settings);
            $kizlo = ['seo' => [
                'head'   => $term_seo->buildMeta($term),
                'schema' => $term_seo->jsonLd($term),
            ]] + $kizlo;
        }

        $data['kizlo'] = $kizlo;

        return $data;
    }

    public function extendListItem(array $data, WP_Term $term): array
    {
        $data['kizlo'] = kizlo_apply_extend_filter('term_list_item', $term);

        return $data;
    }
}
