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

    if (is_array($data) || is_object($data)) $data = print_r($data, true);

    $message = '[' . date('Y-m-d H:i:s') . '] ' . $data . PHP_EOL;

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
 * Parameters match any identifier-safe segment, not digits only, so a route can
 * take an ID or a slug. Kizlo never infers a parameter's type from this pattern;
 * the declared `input` is the only source of truth.
 *
 * @example
 * kizlo_route( '/cf7/submit/:form_id' );
 * // → '/cf7/submit/(?P<form_id>[a-zA-Z0-9_.%+-]+)'
 *
 * kizlo_route( '/cf7/:form_id/fields/:field_id' );
 * // → '/cf7/(?P<form_id>[a-zA-Z0-9_.%+-]+)/fields/(?P<field_id>[a-zA-Z0-9_.%+-]+)'
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
 * Whether WordPress successfully authenticated this request with an
 * Application Password. This identifies the authentication mechanism without
 * binding integrations to a particular password UUID.
 */
function kizlo_is_application_password_authenticated(): bool
{
    return \Kizlo\Modules\RestApi\RestGuard::isApplicationPasswordAuthenticated();
}

/**
 * Register an admin-only REST API endpoint under `kizlo/v1`.
 *
 * Passing an `id` opts the route into introspection. The declaration is then flat:
 * the same array configures the WordPress route, drives its request validation and
 * sanitization, and contributes the operation to `GET /kizlo/v1/introspect`. There
 * is no nested spec and no second `args` array to keep in step.
 *
 * Routes without an `id` register exactly as before and contribute nothing.
 *
 * @since 1.0.0
 *
 * @param array $args {
 *     @type string          $route       Required. Route pattern, e.g. kizlo_route('/orders/:id').
 *     @type string          $method      Required. One HTTP method. Arrays are not supported.
 *     @type callable        $callback    Required. Handler receiving WP_REST_Request.
 *     @type array           $args        Optional. Legacy per-parameter rules. Not used with `input`.
 *
 *     @type string          $id          Optional. API ID that groups this route's operations.
 *     @type string          $operation   Operation name. Prefer list|retrieve|create|update|delete.
 *     @type array           $input       Request schema. Top-level properties become route arguments.
 *     @type string[]        $errors      Handler-specific WordPress error codes for the operation.
 *     @type array           $responses   Status-keyed response contracts.
 *     @type string          $summary     Optional.
 *     @type string          $description Optional.
 *     @type bool            $deprecated  Optional.
 * }
 *
 * @example
 * kizlo_register_route([
 *     'id'        => 'orders',
 *     'operation' => 'create',
 *     'route'     => '/orders',
 *     'method'    => 'POST',
 *     'callback'  => [$controller, 'create'],
 *     'input'     => [
 *         'type'       => 'object',
 *         'properties' => [
 *             'customer_id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint'],
 *         ],
 *     ],
 *     'errors'    => [
 *         'order_not_found',
 *     ],
 *     'responses' => [
 *         '201' => ['description' => 'Order created.', 'body' => ['$ref' => 'orders.order']],
 *         '404' => ['description' => 'Order not found.', 'body' => ['$ref' => 'kizlo.error']],
 *     ],
 * ]);
 *
 * @return void
 */
function kizlo_register_route(array $args): void
{
    \Kizlo\Modules\Introspection\RouteRegistrar::registerRuntime(
        $args,
        \Kizlo\Modules\Introspection\SpecStore::callerIsCore(),
    );
}

/**
 * Describe an existing core or third-party route without registering it.
 *
 * Uses the same flat operation format as kizlo_register_route(), but requires a
 * `namespace` and accepts no runtime callback and no validation/sanitization
 * callbacks. Nothing is registered, no request is made, and the described route
 * is not verified to exist. The factory is evaluated only when `/introspect`
 * builds the document, so deriving somebody else's route costs ordinary
 * WordPress requests nothing.
 *
 * @since 1.0.0
 *
 * @param callable(): array<string, mixed> $derive Returns a flat operation plus a required `namespace` (e.g. 'wc/v3').
 *
 * @example
 * kizlo_register_route_spec(fn(): array => [
 *     'id'        => 'woocommerce.orders',
 *     'operation' => 'list',
 *     'namespace' => 'wc/v3',
 *     'route'     => '/orders',
 *     'method'    => 'GET',
 *     'input'     => [
 *         'type'       => 'object',
 *         'properties' => ['page' => ['type' => 'integer', 'minimum' => 1]],
 *     ],
 *     'responses' => [
 *         '200' => ['body' => ['type' => 'array', 'items' => ['$ref' => 'woocommerce.order']]],
 *     ],
 * ]);
 *
 * @return void
 */
function kizlo_register_route_spec(callable $derive): void
{
    \Kizlo\Modules\Introspection\SpecStore::addRouteFactory(
        $derive,
        \Kizlo\Modules\Introspection\SpecStore::callerIsCore(),
    );
}

/**
 * Start a plugin that builds on Kizlo, but only at versions that can carry it.
 *
 * Kizlo's PHP API grows in core releases, so a plugin calling a function added
 * in core 0.12.0 fatals against core 0.11.0, and WordPress answers a fatal with
 * a white screen rather than a notice. `Requires Plugins` cannot prevent it: it
 * checks that a slug is active, not how new it is.
 *
 * Declare the versions in a `Kizlo Requires` header next to the WordPress ones,
 * as a comma-separated list of slugs and minimum versions. Anything with a
 * plugin header can be named, not only Kizlo:
 *
 *     Requires Plugins: kizlo, woocommerce
 *     Kizlo Requires: kizlo 0.12.0, woocommerce 9.0
 *
 * Then hand over the boot. It runs when every requirement holds. When one does
 * not, nothing of the plugin runs and the Plugins screen says which version of
 * what is missing.
 *
 * @since 1.0.0
 *
 * @param string   $file Plugin's main file, i.e. __FILE__ from it. The header is read off this.
 * @param callable $boot Runs when the requirements hold.
 *
 * @return bool Whether the plugin started.
 *
 * @example
 * // In the plugin's main file. The function_exists check is the one requirement
 * // this cannot express: a core old enough to lack it is too old to be asked.
 * add_action('kizlo_loaded', function (): void {
 *     if (!function_exists('kizlo_extension')) {
 *         add_action('admin_notices', function (): void {
 *             echo '<div class="notice notice-error"><p>My Plugin needs Kizlo 0.12.0 or newer.</p></div>';
 *         });
 *         return;
 *     }
 *
 *     kizlo_extension(__FILE__, fn() => My\Plugin::instance()->boot());
 * });
 */
function kizlo_extension(string $file, callable $boot): bool
{
    return \Kizlo\Modules\Extension\Extensions::register($file, $boot);
}

/**
 * Register a globally reusable schema.
 *
 * Schema IDs are global, so they must be vendor- or domain-qualified. The
 * `kizlo.*`, `post-types.*` and `taxonomies.*` prefixes belong to core and are
 * rejected from outside this plugin.
 *
 * Always write '$ref' and '$extends' in single quotes. In double quotes PHP
 * interpolates them to an empty string.
 *
 * @since 1.0.0
 *
 * @param string                            $id     Globally unique, vendor-qualified ID, e.g. 'orders.order'.
 * @param callable(): array<string, mixed> $derive Returns the Kizlo schema when introspection needs it.
 *
 * @example
 * kizlo_register_route_schema('orders.order', fn(): array => [
 *     'type'       => 'object',
 *     'properties' => [
 *         'id'     => ['type' => 'integer', 'required' => true],
 *         'status' => ['type' => 'string', 'required' => true, 'enum' => ['pending', 'completed']],
 *     ],
 * ]);
 *
 * @return void
 */
function kizlo_register_route_schema(string $id, callable $derive): void
{
    \Kizlo\Modules\Introspection\SpecStore::addSchemaFactory(
        $id,
        $derive,
        \Kizlo\Modules\Introspection\SpecStore::callerIsCore(),
    );
}

/**
 * Rewrite WordPress-style properties in the vocabulary the contract has.
 *
 * For describing an API you do not own. Pass whatever the thing you are
 * describing hands back — a controller's `get_item_schema()['properties']` or
 * `get_collection_params()`, a Store API route's `get_args()` entry, a schema
 * class's `get_properties()` — and get properties ready for the `input` or
 * `responses` of kizlo_register_route_spec().
 *
 * Deriving beats copying: a field the upstream API adds in its next release
 * reaches the contract without anyone re-reading its source, where a
 * hand-written copy goes stale silently.
 *
 * Multi-type arguments become unions, `['string', 'null']` becomes `nullable`,
 * and WordPress's `context`, `readonly` and `arg_options` bookkeeping is dropped
 * along with the sanitizers, which a spec route has no endpoint to run. Anything
 * that cannot be expressed at all is reported to `/introspect` rather than
 * disappearing.
 *
 * @since 1.0.0
 *
 * @param array       $properties Item-schema properties, endpoint args or collection params.
 * @param string      $subject    Route or schema these belong to. Names the source in diagnostics.
 * @param string|null $context    Keep only what this WordPress context returns, e.g. 'view'. Null keeps everything.
 * @param bool        $required   Mark every property required. For a response whose fields are always present.
 *
 * @example
 * kizlo_register_route_spec(fn(): array => [
 *     'id'        => 'woocommerce.orders',
 *     'operation' => 'list',
 *     'namespace' => 'wc/v3',
 *     'route'     => '/orders',
 *     'method'    => 'GET',
 *     'input'     => [
 *         'type'       => 'object',
 *         'properties' => kizlo_translate_spec_properties(
 *             $controller->get_collection_params(),
 *             '/orders',
 *         ),
 *     ],
 * ]);
 *
 * @return array Properties keyed by name.
 */
function kizlo_translate_spec_properties(
    array $properties,
    string $subject = '',
    ?string $context = null,
    bool $required = false
): array {
    return \Kizlo\Modules\Introspection\SpecTranslator::properties($properties, $subject, $context, $required);
}

/**
 * The same translation for a single schema rather than a map of them.
 *
 * For the places a property map is the wrong shape: a response body that is an
 * array of items, or a nested block fetched on its own.
 *
 * @since 1.0.0
 *
 * @param mixed $schema One WordPress-style schema.
 *
 * @return array|null Null when the schema cannot be expressed at all.
 */
function kizlo_translate_spec_schema($schema): ?array
{
    return \Kizlo\Modules\Introspection\SpecTranslator::schema($schema);
}

/**
 * Registers a REST API route interceptor that fires after route callbacks.
 *
 * Hooks into `rest_request_after_callbacks` at maximum priority and invokes
 * the interceptor only when the request matches the given route pattern and,
 * optionally, the HTTP method.
 *
 * @param array $args {
 *     @type string   $route    Required. Route pattern to match against the request. Passed to kizlo_route_match().
 *     @type string   $method   Optional. HTTP method to match (e.g. 'GET'). Matches every method when omitted.
 *     @type callable $callback Required. Callback to invoke when the request matches. Receives the request and response.
 * }
 *
 * @throws InvalidArgumentException If `route` or `callback` is missing.
 */
function kizlo_register_route_interceptor(array $args)
{
    $route    = $args['route'] ?? null;
    $callback = $args['callback'] ?? null;

    if (! $route || ! $callback) {
        throw new InvalidArgumentException('Missing required arguments.');
    }

    $method = is_string($args['method'] ?? null) ? strtoupper($args['method']) : null;

    $filter = static function ($response, $handler, WP_REST_Request $request) use ($route, $method, $callback) {
        if (is_wp_error($response) || ! ($response instanceof WP_REST_Response)) {
            return $response;
        }

        if ($method !== null && strtoupper($request->get_method()) !== $method) {
            return $response;
        }

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
 * Resolve a WordPress media attachment ID to the shared discriminated Media shape.
 * Used when returning media data in API responses.
 *
 * @param  int $id Attachment ID.
 * @return array<string, mixed>
 */
function kizlo_ensure_media_data(int $id): array
{
    $mime       = get_post_mime_type($id) ?: '';
    $media_type = str_starts_with($mime, 'image/')
        ? 'image'
        : (str_starts_with($mime, 'video/')
            ? 'video'
            : (str_starts_with($mime, 'audio/') ? 'audio' : 'file'));

    $data = [
        'type' => $media_type,
        'id'   => $id,
        'name' => get_the_title($id),
        'src'  => (string) wp_get_attachment_url($id),
    ];

    if ($mime !== '') $data['mime'] = $mime;

    $metadata = wp_get_attachment_metadata($id);

    if ($media_type === 'image') {
        $data['alt'] = get_post_meta($id, '_wp_attachment_image_alt', true) ?: '';
    }

    if (($media_type === 'image' || $media_type === 'video') && !empty($metadata['width']) && !empty($metadata['height'])) {
        $data['width']  = (int) $metadata['width'];
        $data['height'] = (int) $metadata['height'];
    }

    if ($media_type === 'image' && !empty($metadata['sizes'])) {
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

    if ($media_type === 'image') {
        $srcset = wp_get_attachment_image_srcset($id, 'full', $metadata ?: null);
        if ($srcset) $data['srcset'] = $srcset;
    }

    if (($media_type === 'video' || $media_type === 'audio') && isset($metadata['length'])) {
        $data['duration'] = (int) $metadata['length'];
    }

    return $data;
}

/**
 * Resolve an attachment only when it is an image union member.
 *
 * Image-specific response fields use this boundary so a stale or directly
 * edited option cannot make their published contract invalid.
 *
 * @param int $id Attachment ID.
 * @return array<string, mixed>|null
 */
function kizlo_ensure_media_image_data(int $id): ?array
{
    $media = kizlo_ensure_media_data($id);

    return $media['type'] === 'image' ? $media : null;
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
