<?php

namespace Kizlo\Modules\PostType;

use WP_Error;
use WP_REST_Request;
use WP_REST_Posts_Controller;

class PostTypeApi
{
    private PostTypeExtension $extension;

    public function __construct()
    {
        $this->extension = new PostTypeExtension();
    }

    public function register(): void
    {
        kizlo_register_route([
            'methods'  => ['GET'],
            'route'    => kizlo_route('/post-types/:post_type'),
            'callback' => function (WP_REST_Request $request) {
                return $this->list(
                    $request->get_param('post_type'),
                    $request
                );
            },
        ]);

        kizlo_register_route([
            'methods'  => ['GET'],
            'route'    => kizlo_route('/post-types/:post_type/:identifier'),
            'callback' => function (WP_REST_Request $request) {
                return $this->retrieve(
                    $request->get_param('post_type'),
                    $request->get_param('identifier'),
                    $request
                );
            },
        ]);

        kizlo_register_route([
            'methods'  => ['POST'],
            'route'    => kizlo_route('/post-types/:post_type'),
            'callback' => function (WP_REST_Request $request) {
                return $this->create(
                    $request->get_param('post_type'),
                    $request
                );
            },
        ]);

        kizlo_register_route([
            'methods'  => ['PATCH'],
            'route'    => kizlo_route('/post-types/:post_type/:identifier'),
            'callback' => function (WP_REST_Request $request) {
                return $this->update(
                    $request->get_param('post_type'),
                    $request->get_param('identifier'),
                    $request
                );
            },
        ]);

        kizlo_register_route([
            'methods'  => ['DELETE'],
            'route'    => kizlo_route('/post-types/:post_type/:identifier'),
            'callback' => function (WP_REST_Request $request) {
                return $this->delete(
                    $request->get_param('post_type'),
                    $request->get_param('identifier'),
                    $request
                );
            },
        ]);
    }

    public function list(string $key, WP_REST_Request $request): mixed
    {
        if (!post_type_exists($key)) {
            return new WP_Error('invalid_post_type', 'Post type not found.', ['status' => 404]);
        }

        $controller = new WP_REST_Posts_Controller($key);

        $attributes         = $request->get_attributes();
        $attributes['args'] = $controller->get_collection_params();
        $request->set_attributes($attributes);

        $sanitized = $request->sanitize_params();
        if (is_wp_error($sanitized)) return $sanitized;

        $response = $controller->get_items($request);

        if (is_wp_error($response)) return $response;

        $items = array_map(function ($item) {
            return $this->extension->extendListItem($item);
        }, $response->get_data());

        $response->set_data($items);
        return $response;
    }

    public function retrieve(string $key, string $identifier, WP_REST_Request $request): mixed
    {
        if (!post_type_exists($key)) {
            return new WP_Error('invalid_post_type', 'Post type not found.', ['status' => 404]);
        }

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

    public function create(string $key, WP_REST_Request $request): mixed
    {
        if (!post_type_exists($key)) {
            return new WP_Error('invalid_post_type', 'Post type not found.', ['status' => 404]);
        }

        $controller = new WP_REST_Posts_Controller($key);
        $response   = $controller->create_item($request);

        if (is_wp_error($response)) return $response;

        $data = $this->extension->extendSingle($response->get_data());
        $response->set_data($data);
        return $response;
    }

    public function update(string $key, string $identifier, WP_REST_Request $request): mixed
    {
        if (!post_type_exists($key)) {
            return new WP_Error('invalid_post_type', 'Post type not found.', ['status' => 404]);
        }

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

    public function delete(string $key, string $identifier, WP_REST_Request $request): mixed
    {
        if (!post_type_exists($key)) {
            return new WP_Error('invalid_post_type', 'Post type not found.', ['status' => 404]);
        }

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
