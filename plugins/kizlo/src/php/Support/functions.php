<?php

/**
 * Returns the plugin path to a specified file.
 *
 * @param   string $filename The specified file.
 * @return  string
 */
function kizlo_get_path($filename = '')
{
    return KIZLO_PATH . ltrim($filename, '/');
}

/**
 * Includes a file within the Kizlo plugin.
 *
 * @param   string $filename The specified file.
 * @return  void
 */
function kizlo_include($filename = '')
{
    $file_path = kizlo_get_path($filename);

    if (file_exists($file_path)) include_once $file_path;
}

/**
 * Write debug information to debug.txt in the plugin root.
 *
 * This function is useful for logging variables, arrays, or messages
 * during development and debugging in WordPress plugins.
 *
 * @param mixed $data   The data to log. Can be a string, number, array, or object.
 * @param bool  $append Whether to append to the file (true) or overwrite it (false). Default true.
 *
 * @return void
 */
function kizlo_log($data = '✨', $append = true)
{
    $log_file = kizlo_get_path('debug.txt');

    // Convert arrays/objects to readable string
    if (is_array($data) || is_object($data)) $data = print_r($data, true);

    // Add timestamp
    $message = '[' . date('Y-m-d H:i:s') . '] ' . $data . PHP_EOL;

    // Write to file
    $mode = $append ? FILE_APPEND : 0;

    @file_put_contents($log_file, $message, $mode);
}

/**
 * Build a REST API route pattern from a path with named parameters.
 *
 * @since 1.0.0
 *
 * @param string $path Route path with parameter placeholders, e.g. '/forms/:id/fields/:field_id'.
 * @return string
 *
 * @example
 * kizlo_route( '/cf7/submit/:form_id' );
 * // → '/cf7/submit/(?P<form_id>\d+)'
 *
 * kizlo_route( '/cf7/:form_id/fields/:field_id' );
 * // → '/cf7/(?P<form_id>\d+)/fields/(?P<field_id>\d+)'
 */
function kizlo_route(string $path): string
{
    return preg_replace('/:([a-zA-Z_]+)/', '(?P<$1>[a-zA-Z0-9_.%+-]+)', $path);
}

/**
 * Checks if a given REST request route matches a defined route pattern.
 *
 * The route pattern may contain named parameters (e.g. `/posts/:id`),
 * which are internally converted to a regular expression.
 *
 * @param string $route   Route pattern with optional named parameters.
 * @param \WP_REST_Request $request WordPress REST request instance.
 *
 * @return bool True if the request route matches the pattern, false otherwise.
 */
function kizlo_route_match(string $route, WP_REST_Request $request): bool
{
    $regex = '#^' . kizlo_route($route) . '$#';
    return preg_match($regex, $request->get_route()) === 1;
}

/**
 * Register an admin-only REST API endpoint.
 *
 * @since 1.0.0
 *
 * @param array $args {
 *     @type string          $route    Required. Route pattern, e.g. '/forms/(?P<id>\d+)'.
 *     @type string|string[] $methods  HTTP method(s). Use WP_REST_Server constants.
 *     @type callable        $callback Handler that receives WP_REST_Request and returns WP_REST_Response|WP_Error.
 *     @type array           $args     Optional. Per-parameter validation/sanitization rules.
 * }
 *
 * @example
 * kizlo_register_route([
 *     'route'    => '/forms/(?P<id>\d+)',
 *     'methods'  => WP_REST_Server::READABLE,
 *     'callback' => function( WP_REST_Request $request ): WP_REST_Response {
 *         return new WP_REST_Response( [ 'id' => $request->get_param( 'id' ) ] );
 *     },
 * ]);
 *
 * @return void
 */
function kizlo_register_route(array $args): void
{
    $route = $args['route'] ?? '';

    if (empty($route)) {
        _doing_it_wrong(__FUNCTION__, '"route" is required.', '1.0.0');
        return;
    }

    $permission_callback = static function () {
        if (! current_user_can('manage_options')) {
            return new WP_Error(
                'rest_forbidden',
                'You do not have permission to access this endpoint.',
                ['status' => 403]
            );
        }
        return true;
    };

    $route_args = array_diff_key($args, array_flip(['route']));
    $route_args['permission_callback'] = $permission_callback;

    $original_callback = $route_args['callback'];
    $route_args['callback'] = function (WP_REST_Request $request) use ($original_callback) {
        try {
            return $original_callback($request);
        } catch (\InvalidArgumentException $e) {
            return new WP_Error('invalid_param', $e->getMessage(), ['status' => 400]);
        }
    };

    add_action('rest_api_init', static function () use ($route, $route_args): void {
        register_rest_route(KIZLO_API_NAMESPACE, $route, $route_args);
    });
}

/**
 * Registers a REST API route interceptor that fires after route callbacks.
 *
 * Hooks into `rest_request_after_callbacks` at maximum priority and invokes
 * the interceptor only when the request matches the given route pattern and,
 * optionally, the specified HTTP methods.
 *
 * @param array $args {
 *     @type string   $route    Required. Route pattern to match against the request. Passed to kizlo_route_match().
 *     @type string[] $methods  Optional. HTTP methods to match (e.g. ['GET', 'POST']). Matches all methods if empty.
 *     @type callable $callback Required. Callback to invoke when the request matches. Receives the response, handler, and request.
 * }
 *
 * @throws InvalidArgumentException If `route` is empty.
 */
function kizlo_register_route_interceptor(array $args)
{
    $route    = $args['route'];
    $methods  = $args['methods'];
    $callback = $args['callback'];

    if (! $route || ! $callback) {
        throw new InvalidArgumentException('Missing required arguments.');
    }

    $filter = static function ($response, $handler, WP_REST_Request $request) use ($route, $methods, $callback) {
        // Bail out if $response is an error or $response isn't a WP_REST_Response.
        // The rest_request_after_callbacks filter may pass an array or other
        // value for some endpoints (e.g. /wc-admin/options), not just a
        // WP_REST_Response or WP_Error.
        if (is_wp_error($response) || ! ($response instanceof WP_REST_Response)) {
            return $response;
        }

        // Match request methods (if defined, allow all otherwise.)
        $methods_array = is_array($methods) ? $methods : [$methods];
        if (! empty($methods) && ! in_array(strtoupper($request->get_method()), array_map('strtoupper', $methods_array), true)) {
            return $response;
        }

        // Match route pattern using kizlo_route_match
        if (! kizlo_route_match($route, $request)) {
            return $response;
        }

        return $callback($request, $response);
    };

    add_filter('rest_request_after_callbacks', $filter, PHP_INT_MAX, 3);
}

/**
 * Applies a named extend filter and normalizes the result structure.
 *
 * Executes the "kizlo_extend_{$name}" filter with a default empty array
 * and the provided argument, then ensures the returned value is always
 * an array wrapped under the 'extend' key.
 *
 * @param string $name Filter suffix used to build the hook name.
 * @param mixed  $arg  Optional argument passed to the filter callback.
 *
 * @return array{extend: array} Structured result with guaranteed array shape.
 */
function kizlo_apply_extend_filter(string $name, $arg = []): array
{
    $extend = apply_filters('kizlo_extend_' . $name, [], $arg);

    return [
        'extend' => is_array($extend) ? $extend : []
    ];
}

/**
 * Resolve a WordPress media attachment ID to the shared Media shape.
 * Used when returning media data in API responses.
 *
 * @param  int $id Attachment ID.
 * @return array{id: int, name: string, alt: string, src: string, mime: string, width?: int, height?: int, variants?: array<int, array{src: string, width: int, height: int}>}
 */
function kizlo_ensure_media_data(int $id): array
{
    $data = [
        'id'   => $id,
        'name' => get_the_title($id),
        'alt'  => get_post_meta($id, '_wp_attachment_image_alt', true) ?: '',
        'src'  => wp_get_attachment_url($id),
        'mime' => get_post_mime_type($id) ?: '',
    ];

    // Raster attachments carry pixel dimensions; SVGs and other scalable
    // sources do not, so these stay absent rather than null.
    $metadata = wp_get_attachment_metadata($id);
    if (!empty($metadata['width']) && !empty($metadata['height'])) {
        $data['width']  = (int) $metadata['width'];
        $data['height'] = (int) $metadata['height'];
    }

    // WordPress auto-generates resized copies of every raster upload. Expose them
    // so consumers (e.g. the web-manifest icon set) can pick a real 192/512-ish
    // source instead of guessing. Scalable sources have no generated sizes.
    if (!empty($metadata['sizes'])) {
        $variants = [];
        foreach (array_keys($metadata['sizes']) as $size) {
            $rendition = wp_get_attachment_image_src($id, $size);
            if (is_array($rendition)) {
                $variants[] = [
                    'src'    => $rendition[0],
                    'width'  => (int) $rendition[1],
                    'height' => (int) $rendition[2],
                ];
            }
        }
        if ($variants) $data['variants'] = $variants;
    }

    return $data;
}

/**
 * Extend the kizlo data for a single post type entry.
 *
 * Fires when a single entry is retrieved via the PostType API.
 * The returned array is injected into `kizlo -> extend` on the response.
 *
 * @param string   $post_type The WordPress post type key (e.g. 'portfolio').
 * @param callable $callback  Callback to provide extend data.
 *                            Receives (WP_REST_Response $response, WP_Post $post, WP_REST_Request $request).
 *                            Must return an array.
 *
 * @example
 * kizlo_extend_post_type('portfolio', function($response, $post, $request) {
 *     return [
 *         'project_url' => get_post_meta($post->ID, 'project_url', true),
 *     ];
 * });
 */
function kizlo_extend_post_type(string $post_type, callable $callback): void
{
    add_filter("rest_prepare_{$post_type}", function (WP_REST_Response $response, WP_Post $post, WP_REST_Request $request) use ($callback) {
        if (!$request->get_param('id')) return $response;

        $data                    = $response->get_data();
        $data['kizlo']['extend'] = $callback($response, $post, $request);

        $response->set_data($data);
        return $response;
    }, 10, 3);
}

/**
 * Extend the kizlo data for each item in a post type list.
 *
 * Fires for each entry when a list is retrieved via the PostType API.
 * The returned array is injected into `kizlo -> extend` on each list item response.
 *
 * @param string   $post_type The WordPress post type key (e.g. 'portfolio').
 * @param callable $callback  Callback to provide extend data.
 *                            Receives (WP_REST_Response $response, WP_Post $post, WP_REST_Request $request).
 *                            Must return an array.
 *
 * @example
 * kizlo_extend_post_type_item('portfolio', function($response, $post, $request) {
 *     return [
 *         'project_url' => get_post_meta($post->ID, 'project_url', true),
 *     ];
 * });
 */
function kizlo_extend_post_type_item(string $post_type, callable $callback): void
{
    add_filter("rest_prepare_{$post_type}", function (WP_REST_Response $response, WP_Post $post, WP_REST_Request $request) use ($callback) {
        if ($request->get_param('id')) return $response;

        $data                    = $response->get_data();
        $data['kizlo']['extend'] = $callback($response, $post, $request);

        $response->set_data($data);
        return $response;
    }, 10, 3);
}

/**
 * Includes an existing post type in Kizlo.
 *
 * @param string $post_type  Post type key. Must already be registered.
 */
function kizlo_include_post_type(string $post_type): void
{
    add_filter('kizlo_included_post_types', function (array $post_types) use ($post_type): array {
        $post_types[] = $post_type;
        return $post_types;
    });
}

/**
 * Includes an existing taxonomy in Kizlo.
 *
 * @param string $taxonomy   Taxonomy key. Must already be registered.
 */
function kizlo_include_taxonomy(string $taxonomy): void
{
    add_filter('kizlo_included_taxonomies', function (array $taxonomies) use ($taxonomy): array {
        $taxonomies[] = $taxonomy;
        return $taxonomies;
    });
}

/**
 * Emit a signed Kizlo webhook event from WordPress.
 *
 * Sends the event to every configured webhook URL so matching `createEventHandler`
 * handlers in your Kizlo app receive the `{ type, data }` payload. Delivery is
 * non-blocking and best-effort. Thin wrapper over \Kizlo\Modules\Webhook\Webhook::sendEvent().
 *
 * @param string     $type The event type, e.g. 'review.created'. Handlers match on this.
 * @param array|null $data Optional payload merged into the event's `data`. Default null.
 *
 * @return bool False when no site secret or webhook URLs are configured; otherwise true once dispatched.
 *
 * @example
 * kizlo_emit_event('review.created', [
 *     'review_id' => $review->id,
 *     'rating'    => $review->rating,
 * ]);
 */
function kizlo_emit_event(string $type, ?array $data = null): bool
{
    return \Kizlo\Modules\Webhook\Webhook::sendEvent($type, $data);
}


kizlo_include_post_type('projects');
