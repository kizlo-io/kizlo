<?php

namespace Kizlo\Modules\Taxonomy;

use WP_Error;
use WP_Term;
use WP_REST_Request;
use WP_REST_Terms_Controller;
use Kizlo\Modules\Introspection\CoreControllers;
use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\ManagedTaxonomies;
use Kizlo\Modules\Introspection\ManagedWrite;
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
    private TaxonomyExtension $extension;

    public function __construct()
    {
        $this->extension = new TaxonomyExtension();
    }

    public function register(): void
    {
        add_action('rest_api_init', function (): void {
            foreach (array_keys(ManagedTaxonomies::managed()) as $slug) {
                foreach (ManagedTaxonomies::routesFor($slug) as $operation => $declaration) {
                    $handler = $this->handler($slug, $operation);

                    if ($handler === null) {
                        continue;
                    }

                    RouteRegistrar::registerManaged($declaration, $handler, self::validator($slug, $operation));
                }
            }
        });
    }

    /** @see \Kizlo\Modules\PostType\PostTypeApi::handler() for why this can return null. */
    private function handler(string $slug, string $operation): ?callable
    {
        switch ($operation) {
            case 'list':
                return fn(WP_REST_Request $request) => $this->list($slug, self::pinContext($request));
            case 'retrieve':
                return fn(WP_REST_Request $request) => $this->retrieve($slug, $request->get_param('identifier'), self::pinContext($request));
            case 'create':
                return fn(WP_REST_Request $request) => $this->create($slug, self::pinContext($request));
            case 'update':
            case 'replace':
                return fn(WP_REST_Request $request) => $this->update($slug, $request->get_param('identifier'), self::pinContext($request));
            case 'delete':
                return fn(WP_REST_Request $request) => $this->delete($slug, $request->get_param('identifier'), self::pinContext($request));
        }

        _doing_it_wrong(
            __METHOD__,
            esc_html(sprintf('The "%s" operation is described for "%s" but has no handler.', $operation, $slug)),
            '1.0.0'
        );

        return null;
    }

    /**
     * @see \Kizlo\Modules\PostType\PostTypeApi::validator()
     *
     * `replace` shares `update`'s declaration and handler here, and publishes
     * the same partial input, so it is a partial write too. Leaving it out would
     * not merely skip its validation: {@see ManagedWrite} is also what tells the
     * insert hook that a request came from a managed route, so a `PUT` carrying
     * `kizlo.custom` or `kizlo.seo` would stop persisting altogether.
     */
    private static function validator(string $slug, string $operation): ?callable
    {
        $partial = match ($operation) {
            'create'            => false,
            'update', 'replace' => true,
            default             => null,
        };

        if ($partial === null) {
            return null;
        }

        return (new ManagedWrite(ManagedWrite::TAXONOMY, $slug, $partial))->callback();
    }

    /** @see \Kizlo\Modules\PostType\PostTypeApi::pinContext() for why this is forced rather than declared. */
    private static function pinContext(WP_REST_Request $request): WP_REST_Request
    {
        $request->set_param('context', CoreItemSchema::CONTEXT);

        return $request;
    }

    /**
     * The terms controller reads `per_page` and `page` straight out of the request
     * to build its `number` and `offset`, so it depends on their defaults being
     * present. The route's declared arguments apply them.
     */
    private function list(string $taxonomy, WP_REST_Request $request): mixed
    {
        $response = CoreControllers::forTaxonomy($taxonomy)->get_items($request);

        if (is_wp_error($response)) return $response;

        $items = array_map($this->extension->extendListItem(...), $response->get_data());

        $response->set_data($items);
        return $response;
    }

    private function retrieve(string $taxonomy, string $identifier, WP_REST_Request $request): mixed
    {
        $id = $this->resolve_id($identifier, $taxonomy);
        if (!$id) {
            return new WP_Error('term_not_found', 'Term not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        $response = CoreControllers::forTaxonomy($taxonomy)->get_item($request);

        if (is_wp_error($response)) return $response;

        $response->set_data($this->extension->extendSingle($response->get_data()));
        return $response;
    }

    private function create(string $taxonomy, WP_REST_Request $request): mixed
    {
        $response = CoreControllers::forTaxonomy($taxonomy)->create_item($request);

        if (is_wp_error($response)) return $response;

        $response->set_data($this->extension->extendSingle($response->get_data()));
        return $response;
    }

    private function update(string $taxonomy, string $identifier, WP_REST_Request $request): mixed
    {
        $id = $this->resolve_id($identifier, $taxonomy);
        if (!$id) {
            return new WP_Error('term_not_found', 'Term not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        $response = CoreControllers::forTaxonomy($taxonomy)->update_item($request);

        if (is_wp_error($response)) return $response;

        $response->set_data($this->extension->extendSingle($response->get_data()));
        return $response;
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

        $controller = CoreControllers::forTaxonomy($taxonomy);
        $term       = get_term($id, $taxonomy);
        $previous   = $term instanceof WP_Term
            ? $this->extension->extendSingle($controller->prepare_item_for_response($term, $request)->get_data(), $term)
            : null;
        $response   = $controller->delete_item($request);

        if (is_wp_error($response) || !is_array($previous)) return $response;

        $data = $response->get_data();
        if (is_array($data['previous'] ?? null)) {
            $data['previous'] = $previous;
            $response->set_data($data);
        }

        return $response;
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
