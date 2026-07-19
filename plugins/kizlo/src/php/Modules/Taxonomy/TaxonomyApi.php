<?php

namespace Kizlo\Modules\Taxonomy;

use WP_Error;
use WP_REST_Request;
use WP_REST_Terms_Controller;

/**
 * Custom `kizlo/v1/taxonomies/:taxonomy` routes that mirror {@see \Kizlo\Modules\PostType\PostTypeApi}
 * for terms. Their reason to exist is the same: WordPress only fetches a single
 * term by numeric id, so slug lookups otherwise need a list-then-get round trip.
 * `retrieve`/`update`/`delete` resolve the identifier (id or slug) server-side and
 * delegate to {@see WP_REST_Terms_Controller}, whose responses are enriched by the
 * registered `rest_prepare_{taxonomy}` filter ({@see TermExtension}).
 */
class TaxonomyApi
{
    public function register(): void
    {
        kizlo_register_route([
            'methods'  => ['GET'],
            'route'    => kizlo_route('/taxonomies/:taxonomy'),
            'callback' => fn(WP_REST_Request $request) => $this->list($request->get_param('taxonomy'), $request),
        ]);

        kizlo_register_route([
            'methods'  => ['GET'],
            'route'    => kizlo_route('/taxonomies/:taxonomy/:identifier'),
            'callback' => fn(WP_REST_Request $request) => $this->retrieve($request->get_param('taxonomy'), $request->get_param('identifier'), $request),
        ]);

        kizlo_register_route([
            'methods'  => ['POST'],
            'route'    => kizlo_route('/taxonomies/:taxonomy'),
            'callback' => fn(WP_REST_Request $request) => $this->create($request->get_param('taxonomy'), $request),
        ]);

        kizlo_register_route([
            'methods'  => ['PUT', 'PATCH'],
            'route'    => kizlo_route('/taxonomies/:taxonomy/:identifier'),
            'callback' => fn(WP_REST_Request $request) => $this->update($request->get_param('taxonomy'), $request->get_param('identifier'), $request),
        ]);

        kizlo_register_route([
            'methods'  => ['DELETE'],
            'route'    => kizlo_route('/taxonomies/:taxonomy/:identifier'),
            'callback' => fn(WP_REST_Request $request) => $this->delete($request->get_param('taxonomy'), $request->get_param('identifier'), $request),
        ]);
    }

    public function list(string $taxonomy, WP_REST_Request $request): mixed
    {
        if (!taxonomy_exists($taxonomy)) {
            return new WP_Error('invalid_taxonomy', 'Taxonomy not found.', ['status' => 404]);
        }

        $controller = new WP_REST_Terms_Controller($taxonomy);
        $params     = $controller->get_collection_params();

        $attributes         = $request->get_attributes();
        $attributes['args'] = $params;
        $request->set_attributes($attributes);

        foreach ($params as $key => $arg) {
            if (isset($arg['default']) && null === $request->get_param($key)) {
                $request->set_param($key, $arg['default']);
            }
        }

        $sanitized = $request->sanitize_params();
        if (is_wp_error($sanitized)) return $sanitized;

        return $controller->get_items($request);
    }

    public function retrieve(string $taxonomy, string $identifier, WP_REST_Request $request): mixed
    {
        if (!taxonomy_exists($taxonomy)) {
            return new WP_Error('invalid_taxonomy', 'Taxonomy not found.', ['status' => 404]);
        }

        $id = $this->resolve_id($identifier, $taxonomy);
        if (!$id) {
            return new WP_Error('term_not_found', 'Term not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        return (new WP_REST_Terms_Controller($taxonomy))->get_item($request);
    }

    public function create(string $taxonomy, WP_REST_Request $request): mixed
    {
        if (!taxonomy_exists($taxonomy)) {
            return new WP_Error('invalid_taxonomy', 'Taxonomy not found.', ['status' => 404]);
        }

        return (new WP_REST_Terms_Controller($taxonomy))->create_item($request);
    }

    public function update(string $taxonomy, string $identifier, WP_REST_Request $request): mixed
    {
        if (!taxonomy_exists($taxonomy)) {
            return new WP_Error('invalid_taxonomy', 'Taxonomy not found.', ['status' => 404]);
        }

        $id = $this->resolve_id($identifier, $taxonomy);
        if (!$id) {
            return new WP_Error('term_not_found', 'Term not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        return (new WP_REST_Terms_Controller($taxonomy))->update_item($request);
    }

    public function delete(string $taxonomy, string $identifier, WP_REST_Request $request): mixed
    {
        if (!taxonomy_exists($taxonomy)) {
            return new WP_Error('invalid_taxonomy', 'Taxonomy not found.', ['status' => 404]);
        }

        $id = $this->resolve_id($identifier, $taxonomy);
        if (!$id) {
            return new WP_Error('term_not_found', 'Term not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        return (new WP_REST_Terms_Controller($taxonomy))->delete_item($request);
    }

    private function resolve_id(string $identifier, string $taxonomy): ?int
    {
        if (is_numeric($identifier)) {
            return (int) $identifier;
        }

        $term = get_term_by('slug', $identifier, $taxonomy);
        return $term ? (int) $term->term_id : null;
    }
}
