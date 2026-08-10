<?php

namespace Kizlo\Modules\Taxonomy;

use WP_Error;
use WP_REST_Request;
use WP_REST_Terms_Controller;
use Kizlo\Modules\Introspection\ManagedTaxonomies;
use Kizlo\Modules\Introspection\RouteRegistrar;

/**
 * Custom `kizlo/v1/taxonomies/…` routes that mirror {@see \Kizlo\Modules\PostType\PostTypeApi}
 * for terms. Their reason to exist is the same: WordPress only fetches a single
 * term by numeric id, so slug lookups otherwise need a list-then-get round trip.
 * `retrieve`/`update`/`delete` resolve the identifier (id or slug) server-side and
 * delegate to {@see WP_REST_Terms_Controller}, whose responses are enriched by the
 * registered `rest_prepare_{taxonomy}` filter ({@see TermExtension}).
 *
 * Registration mirrors it too: one route per managed slug per operation, built
 * from the declarations {@see ManagedTaxonomies} publishes, so the arguments the
 * route enforces are the ones the contract advertises.
 */
class TaxonomyApi
{
    public function register(): void
    {
        add_action('rest_api_init', function (): void {
            foreach (ManagedTaxonomies::managed() as $slug => $object) {
                foreach (ManagedTaxonomies::routesFor($slug, $object) as $operation => $declaration) {
                    $handler = $this->handler($slug, $operation);

                    if ($handler === null) {
                        continue;
                    }

                    RouteRegistrar::registerManaged($declaration, $handler);
                }
            }
        });
    }

    /** @see \Kizlo\Modules\PostType\PostTypeApi::handler() for why this can return null. */
    private function handler(string $slug, string $operation): ?callable
    {
        switch ($operation) {
            case 'list':
                return fn(WP_REST_Request $request) => $this->list($slug, $request);
            case 'retrieve':
                return fn(WP_REST_Request $request) => $this->retrieve($slug, $request->get_param('identifier'), $request);
            case 'create':
                return fn(WP_REST_Request $request) => $this->create($slug, $request);
            case 'update':
                return fn(WP_REST_Request $request) => $this->update($slug, $request->get_param('identifier'), $request);
            case 'delete':
                return fn(WP_REST_Request $request) => $this->delete($slug, $request->get_param('identifier'), $request);
        }

        _doing_it_wrong(
            __METHOD__,
            esc_html(sprintf('The "%s" operation is described for "%s" but has no handler.', $operation, $slug)),
            '1.0.0'
        );

        return null;
    }

    /**
     * The terms controller reads `per_page` and `page` straight out of the request
     * to build its `number` and `offset`, so it depends on their defaults being
     * present. The route's declared arguments apply them.
     */
    private function list(string $taxonomy, WP_REST_Request $request): mixed
    {
        return (new WP_REST_Terms_Controller($taxonomy))->get_items($request);
    }

    private function retrieve(string $taxonomy, string $identifier, WP_REST_Request $request): mixed
    {
        $id = $this->resolve_id($identifier, $taxonomy);
        if (!$id) {
            return new WP_Error('term_not_found', 'Term not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        return (new WP_REST_Terms_Controller($taxonomy))->get_item($request);
    }

    private function create(string $taxonomy, WP_REST_Request $request): mixed
    {
        return (new WP_REST_Terms_Controller($taxonomy))->create_item($request);
    }

    private function update(string $taxonomy, string $identifier, WP_REST_Request $request): mixed
    {
        $id = $this->resolve_id($identifier, $taxonomy);
        if (!$id) {
            return new WP_Error('term_not_found', 'Term not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        return (new WP_REST_Terms_Controller($taxonomy))->update_item($request);
    }

    /**
     * Terms cannot be trashed, so core refuses anything but `force=true`. It reads
     * the flag as `(bool) $request['force']`, which made the string "false" delete
     * the term outright until the route started declaring it a boolean.
     */
    private function delete(string $taxonomy, string $identifier, WP_REST_Request $request): mixed
    {
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
