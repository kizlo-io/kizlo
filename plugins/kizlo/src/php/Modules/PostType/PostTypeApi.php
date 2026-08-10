<?php

namespace Kizlo\Modules\PostType;

use WP_Error;
use WP_REST_Request;
use WP_REST_Posts_Controller;
use Kizlo\Modules\Introspection\ManagedPostTypes;
use Kizlo\Modules\Introspection\RouteRegistrar;

/**
 * The `kizlo/v1/post-types/…` routes.
 *
 * One route per managed slug per operation, registered from the very
 * declarations {@see ManagedPostTypes} publishes to `/introspect`. A generic
 * `/post-types/:post_type` route would be shorter, but it can only carry one set
 * of arguments, and supports, hierarchy, connected taxonomies and custom fields
 * all differ per type — so a generic route can enforce nothing, which is what it
 * used to do. Registering from the declaration means the arguments WordPress
 * validates against and the constraints the contract advertises cannot disagree.
 *
 * Registration waits for `rest_api_init` because which slugs are managed depends
 * on post types existing and on settings, neither of which is true at load time.
 */
class PostTypeApi
{
    private PostTypeExtension $extension;

    public function __construct()
    {
        $this->extension = new PostTypeExtension();
    }

    public function register(): void
    {
        add_action('rest_api_init', function (): void {
            foreach (array_keys(ManagedPostTypes::managed()) as $slug) {
                foreach (ManagedPostTypes::routesFor($slug) as $operation => $declaration) {
                    $handler = $this->handler($slug, $operation);

                    if ($handler === null) {
                        continue;
                    }

                    RouteRegistrar::registerManaged($declaration, $handler);
                }
            }
        });
    }

    /**
     * What actually runs for a declared operation.
     *
     * Null when nothing does. That is a bug rather than a configuration, since
     * both sides of this pairing ship together, so it is reported — a described
     * route with no handler behind it is the failure this whole arrangement
     * exists to rule out. It is not fatal, because taking the entire REST API
     * down is a worse answer to it than serving the other four operations.
     */
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
     * The route carries the declared collection parameters, so they arrive
     * validated and sanitized with their defaults already applied. Nothing is
     * re-derived from the controller here.
     */
    private function list(string $key, WP_REST_Request $request): mixed
    {
        $response = (new WP_REST_Posts_Controller($key))->get_items($request);

        if (is_wp_error($response)) return $response;

        $items = array_map(function ($item) {
            return $this->extension->extendListItem($item);
        }, $response->get_data());

        $response->set_data($items);
        return $response;
    }

    private function retrieve(string $key, string $identifier, WP_REST_Request $request): mixed
    {
        $id = $this->resolve_id($identifier, $key);

        if (!$id) {
            return new WP_Error('post_type_not_found', 'Entry not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        $controller = new WP_REST_Posts_Controller($key);
        $response   = $controller->get_item($request);

        if (is_wp_error($response)) return $response;

        $data = $this->extension->extendSingle($response->get_data());
        $response->set_data($data);

        return $response;
    }

    private function create(string $key, WP_REST_Request $request): mixed
    {
        $controller = new WP_REST_Posts_Controller($key);
        $response   = $controller->create_item($request);

        if (is_wp_error($response)) return $response;

        $data = $this->extension->extendSingle($response->get_data());
        $response->set_data($data);
        return $response;
    }

    private function update(string $key, string $identifier, WP_REST_Request $request): mixed
    {
        $id = $this->resolve_id($identifier, $key);

        if (!$id) {
            return new WP_Error('post_type_not_found', 'Entry not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        $controller = new WP_REST_Posts_Controller($key);
        $response   = $controller->update_item($request);

        if (is_wp_error($response)) return $response;

        $data = $this->extension->extendSingle($response->get_data());
        $response->set_data($data);
        return $response;
    }

    /**
     * `force` reaches the controller as a real boolean because the route declares
     * it as one. Core reads it as `(bool) $request['force']`, and every non-empty
     * string is truthy in PHP, so an undeclared `force=false` used to delete
     * permanently.
     */
    private function delete(string $key, string $identifier, WP_REST_Request $request): mixed
    {
        $id = $this->resolve_id($identifier, $key);

        if (!$id) {
            return new WP_Error('post_type_not_found', 'Entry not found.', ['status' => 404]);
        }

        $request->set_param('id', $id);

        $controller = new WP_REST_Posts_Controller($key);
        return $controller->delete_item($request);
    }

    private function resolve_id(string $identifier, string $post_type): ?int
    {
        if (is_numeric($identifier)) {
            return (int) $identifier;
        }

        $post = get_page_by_path($identifier, OBJECT, $post_type);
        return $post ? $post->ID : null;
    }
}
