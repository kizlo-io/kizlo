<?php

namespace Kizlo\Modules\Taxonomy;

use WP_Term;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Utils;
use Kizlo\Modules\Seo\TermSchema;

/**
 * Injects resolved SEO into the term REST responses the headless frontend reads,
 * mirroring {@see \Kizlo\Modules\Post\PostExtension} for posts.
 *
 * Hooks `rest_prepare_{taxonomy}` for every Kizlo-managed taxonomy (the same set
 * the term editor is registered on), so a single-term response carries the
 * resolved `head` meta + JSON-LD `schema` built from the taxonomy templates and
 * any per-term overrides. List responses only carry the light term base.
 */
class TermExtension
{
    public function register(): void
    {
        foreach (array_keys(Utils::getSettings()->taxonomies->all()) as $taxonomy) {
            add_filter("rest_prepare_{$taxonomy}", [$this, 'prepare'], PHP_INT_MAX, 3);
        }
    }

    public function prepare(WP_REST_Response | WP_Error $response, WP_Term $term, WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        if ($request->get_param('id')) {
            $response->set_data($this->extendSingle($response->get_data(), $term));
        } else {
            $response->set_data($this->extendListItem($response->get_data(), $term));
        }

        return $response;
    }

    public function extendSingle(array $data, WP_Term $term): array
    {
        $term_seo = new TermSchema(Utils::getSettings());

        $data['kizlo'] = array_merge([
            'seo' => [
                'head'   => $term_seo->buildMeta($term),
                'schema' => $term_seo->jsonLd($term),
            ],
        ], $this->extendBase($term), kizlo_apply_extend_filter('term', $term));

        return $data;
    }

    public function extendListItem(array $data, WP_Term $term): array
    {
        $data['kizlo'] = array_merge([], $this->extendBase($term), kizlo_apply_extend_filter('term_list_item', $term));

        return $data;
    }

    /**
     * The shared term base carried on both single and list responses.
     *
     * @return array{id: int, name: string, slug: string, description: string, parent: int, count: int, url: string}
     */
    private function extendBase(WP_Term $term): array
    {
        $settings = Utils::getSettings();

        return [
            'id'          => $term->term_id,
            'name'        => $term->name,
            'slug'        => $term->slug,
            'description' => $term->description,
            'parent'      => $term->parent,
            'count'       => $term->count,
            'url'         => $settings->resolveTermUrl($term, $settings->taxonomies->get($term->taxonomy)),
        ];
    }
}
