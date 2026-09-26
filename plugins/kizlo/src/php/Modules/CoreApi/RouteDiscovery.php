<?php

namespace Kizlo\Modules\CoreApi;

use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\CoreResource;
use Kizlo\Modules\Introspection\CoreRouteArgs;
use Kizlo\Modules\Introspection\ManagedPostTypes;
use Kizlo\Modules\Introspection\OperationErrors;
use Kizlo\Modules\Introspection\PathNormalizer;
use Kizlo\Modules\Introspection\SchemaNormalizer;
use Kizlo\Modules\Introspection\Spec;
use Kizlo\Modules\Introspection\SpecStore;
use WP_REST_Attachments_Controller;
use WP_REST_Controller;

/**
 * The contract for WordPress's own REST API, read off the route table.
 *
 * Kizlo used to describe three core routes, each hand-declared. That does not
 * scale past three, and more importantly it describes only what somebody
 * remembered to list. `register_post_type( $slug, [ 'show_in_rest' => true ] )`
 * makes WordPress generate a whole `wp/v2` route set served by core's own
 * controller, so a maintained list would be blind to exactly the content a
 * Kizlo site is built around — the user's own types.
 *
 * So nothing here enumerates resources. This walks `rest_get_server()->get_routes()`
 * and derives a declaration from each registration: the path and its parameters
 * from the route regex, the input from the arguments core registered the handler
 * with, the response from the controller that handler belongs to. A route
 * WordPress adds in a later release, or a plugin adds this afternoon, is
 * described without a line changing here.
 *
 * ## What it cannot derive
 *
 * Three things, and all of them are deliberate rather than overlooked.
 *
 * Error codes. Nothing in a registration records which `WP_Error` codes a handler
 * can return and no runtime API exposes it, so a described route carries only the
 * pre-dispatch set {@see \Kizlo\Modules\Introspection\OperationErrors::NATIVE}
 * that WordPress itself can answer with. Handler codes arrive separately through
 * `kizlo_register_route_errors()` or `kizlo_introspection_route_errors`.
 *
 * Whatever a response gains after the controller built it. Kizlo adds a `kizlo`
 * block to comments and menu items through `rest_prepare_comment` and
 * `rest_prepare_nav_menu_item`, which is not in `get_item_schema()` and which no
 * derivation can see. {@see self::SCHEMA_FILTER} is how that gets back in, and
 * {@see \Kizlo\Modules\Comment\CommentSchemas} is its first caller.
 *
 * The response of a route no `WP_REST_Controller` serves. `get_item_schema()` is
 * the only shape this can read on its own, and a closure route or a route object
 * of somebody else's design has no such method to call. Whoever registered it can
 * read it, so {@see self::RESPONSE_FILTER} asks them. Unanswered, the route is
 * still described, with an object whose fields are declared unknown rather than
 * invented: a caller can reach the route and read the body itself, which is more
 * than it could do when such a route was dropped altogether.
 *
 * ## Escaping it
 *
 * None of the filters is for Kizlo's benefit alone. {@see self::ROUTE_FILTER}
 * hands each derived declaration out before it is registered, so a site can
 * correct one, extend one, or return null to keep a route out of its contract
 * entirely. {@see self::PREFIX_FILTER} lets a namespace say what its routes are
 * called, which is what keeps two namespaces serving `/products` from claiming
 * one name. A plugin that wants full control instead of correction still has
 * `kizlo_register_route_spec()`, which takes a complete declaration and is what
 * {@see CoreResource} is built on.
 */
final class RouteDiscovery
{
    /** The namespaces described when no site or integration changes the list. */
    public const NAMESPACES = ['wp/v2', 'wp-site-health/v1'];

    /** The REST namespaces whose registered routes are derived. */
    public const NAMESPACE_FILTER = 'kizlo_introspection_core_namespaces';

    /**
     * The API ID prefix a namespace's discovered routes are named under.
     *
     * An API ID is every literal in the path and nothing else, which is what
     * makes it stable, and also what makes `wc/v3/products` and
     * `wc/store/v1/products` the same name. Two namespaces describing the same
     * resource is normal, so the namespace has to be able to say what its own
     * routes are called. Empty by default: `wp/v2` owns the unqualified names.
     */
    public const PREFIX_FILTER = 'kizlo_introspection_core_api_prefix';

    /** Each derived declaration, before registration. Return null to drop the route. */
    public const ROUTE_FILTER = 'kizlo_introspection_core_route';

    /** Each derived response shape, so a runtime addition can be described. */
    public const SCHEMA_FILTER = 'kizlo_introspection_core_schema';

    /**
     * The response properties for a route core's own derivation cannot read.
     *
     * `WP_REST_Controller` publishes `get_item_schema()`, and everything else
     * publishes whatever it likes: the WooCommerce Store API answers from an
     * `AbstractRoute` with its own `get_item_schema()`. Whoever registered the route
     * knows how to read it, so they are asked. Return null to say you cannot.
     */
    public const RESPONSE_FILTER = 'kizlo_introspection_core_response';

    /** @var array{declarations: array<int, array<string, mixed>>, schemas: array<string, array<string, mixed>>}|null */
    private static ?array $memo = null;

    private static bool $ready = false;

    /** @var array<string, string> */
    private static array $prefixes = [];

    /**
     * Say that the route table is finished.
     *
     * Core registers its own routes on `rest_api_init` at priority 99, and Kizlo
     * registers its endpoints at 10, so anything Kizlo asks during its own
     * registration is asking before WordPress has answered. `Registry::schemaMap()`
     * does exactly that, and it memoizes, so a discovery run at that moment would
     * freeze an empty contract for the rest of the request. Nothing is derived
     * until this has been called at the end of the hook.
     */
    public static function arm(): void
    {
        self::$ready = true;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function declarations(): array
    {
        return self::discover()['declarations'];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function schemas(): array
    {
        return self::discover()['schemas'];
    }

    public static function flush(): void
    {
        self::$memo     = null;
        self::$prefixes = [];
    }

    // ============================================================
    // THE WALK
    // ============================================================

    /**
     * @return array{declarations: array<int, array<string, mixed>>, schemas: array<string, array<string, mixed>>}
     */
    private static function discover(): array
    {
        if (self::$memo !== null) {
            return self::$memo;
        }

        // Answered, but never remembered, until the route table is complete.
        if (!self::$ready) {
            return ['declarations' => [], 'schemas' => []];
        }

        $declarations = [];
        $schemas      = [];
        $claimed      = [];
        $byShape      = [];

        foreach (self::routes() as [$namespace, $route, $handlers]) {
            $normalized = PathNormalizer::normalize($route);

            if ($normalized['errors'] !== []) {
                foreach ($normalized['errors'] as $message) {
                    SpecStore::addError(['path' => $route, 'keyword' => 'route'], $message);
                }
                continue;
            }

            $path  = $normalized['path'];
            $apiId = RouteIdentity::apiId($path);

            // A namespace index such as `/wp/v2` has no literal segment to be
            // named after, and what it returns is the route table rather than a
            // resource. It is the only route without an API ID.
            if ($apiId === null) {
                continue;
            }

            $prefix = self::prefix($namespace);
            $apiId  = $prefix === '' ? $apiId : $prefix . '.' . $apiId;

            $addresses = str_ends_with($path, '}');

            // The name a collision is scoped by is the path's last capture,
            // wherever it sits. `/settings/{group_id}/batch` claims `create`
            // twice and is scoped by the group it batches, even though the path
            // does not end in the parameter that names it.
            $parameter = $normalized['parameters'] === [] ? '' : (string) end($normalized['parameters']);

            foreach ($handlers as $handler) {
                if (!is_array($handler)) {
                    continue;
                }

                $subject    = self::subject($handler);
                $controller = $subject instanceof WP_REST_Controller ? $subject : null;
                $callback   = is_array($handler['callback'] ?? null) ? (string) ($handler['callback'][1] ?? '') : '';

                foreach (RouteMethods::operations($handler, $callback, $addresses) as $operation => $method) {
                    $operation = (string) $operation;

                    if (($claimed[$apiId][$operation] ?? $path) !== $path) {
                        // Core registers a collection and the same collection
                        // scoped by a parameter on one `get_items()`, so both
                        // arrive as `list`. The scoped one says what scopes it.
                        $operation = RouteIdentity::scoped($operation, $parameter);
                    }

                    $claimed[$apiId][$operation] = $path;

                    $schemaId = self::schema($schemas, $byShape, $apiId, $prefix, $subject, $operation, $path, $namespace, $route);

                    $declaration = self::declare(
                        $apiId,
                        $namespace,
                        $route,
                        $path,
                        $method,
                        $operation,
                        $controller,
                        $schemaId,
                        $normalized['parameters'],
                    );

                    /** @var array<string, mixed>|null $filtered */
                    $filtered = apply_filters(self::ROUTE_FILTER, $declaration, $namespace, $route, $method);

                    if (is_array($filtered)) {
                        $declarations[] = self::guarded($filtered, $namespace, $route, $method);
                    }
                }
            }
        }

        return self::$memo = ['declarations' => $declarations, 'schemas' => $schemas];
    }

    /**
     * What WordPress itself can answer with before the handler runs.
     *
     * Contributing through `kizlo_introspection_routes` reaches the document
     * directly, which skips the envelope {@see \Kizlo\Modules\Introspection\RouteRegistrar}
     * puts on a declared spec. So it is put on here, and after the filter rather
     * than before it, because these are the codes the route can answer with
     * whatever anyone else decided about it.
     *
     * `RestGuard` leaves `wp/v2` on WordPress's own authentication, so a native
     * route gets the pre-dispatch set alone. A route an integration opts into the
     * guard with `kizlo_rest_route_requires_admin` gets the guard's codes too,
     * because the guard then stands in front of it exactly as it does a Kizlo one.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    private static function guarded(array $declaration, string $namespace, string $route, string $method): array
    {
        $request = new \WP_REST_Request($method, sprintf('/%s%s', trim($namespace, '/'), $route));

        return \Kizlo\Modules\RestApi\RestGuard::protectsRoute($request)
            ? OperationErrors::withGuard($declaration)
            : OperationErrors::withNative($declaration);
    }

    /**
     * Every route in a described namespace, shortest path first.
     *
     * The order decides which of two routes claiming one operation name keeps it,
     * and the shorter one should: `/block-types` is the plain list and
     * `/block-types/{namespace}` is the scoped one, not the other way round.
     *
     * @return array<int, array{0: string, 1: string, 2: array<int, mixed>}>
     */
    private static function routes(): array
    {
        $found      = [];
        $namespaces = self::namespaces();

        foreach (rest_get_server()->get_routes() as $route => $handlers) {
            foreach ($namespaces as $namespace) {
                $prefix = '/' . trim($namespace, '/');

                if ($route === $prefix || !str_starts_with($route, $prefix . '/')) {
                    continue;
                }

                $found[] = [$namespace, substr($route, strlen($prefix)), is_array($handlers) ? $handlers : []];
            }
        }

        usort($found, static function (array $a, array $b): int {
            return [substr_count($a[1], '/'), $a[1]] <=> [substr_count($b[1], '/'), $b[1]];
        });

        return $found;
    }

    /**
     * The configured namespace list, with a broken contribution excluded rather
     * than allowed to make introspection fatal.
     *
     * @return array<int, string>
     */
    private static function namespaces(): array
    {
        $filtered = apply_filters(self::NAMESPACE_FILTER, self::NAMESPACES);

        if (!is_array($filtered)) {
            SpecStore::addError(
                ['keyword' => self::NAMESPACE_FILTER],
                sprintf('The "%s" filter must return an array of REST namespaces; the default list was kept.', self::NAMESPACE_FILTER),
            );

            return self::NAMESPACES;
        }

        $namespaces = [];

        foreach ($filtered as $namespace) {
            if (!Spec::isValidNamespace($namespace)) {
                SpecStore::addError(
                    ['keyword' => self::NAMESPACE_FILTER],
                    sprintf(
                        'The "%s" filter returned an invalid REST namespace (%s); that entry was ignored.',
                        self::NAMESPACE_FILTER,
                        is_string($namespace) ? sprintf('"%s"', $namespace) : gettype($namespace),
                    ),
                );
                continue;
            }

            $namespaces[$namespace] = true;
        }

        return array_keys($namespaces);
    }

    /**
     * What this namespace's discovered API IDs are named under.
     *
     * Validated as an API ID because that is what it becomes the head of, and a
     * broken contribution loses its prefix rather than the contract: an ID that
     * cannot be parsed would take every route in the namespace down with it.
     */
    private static function prefix(string $namespace): string
    {
        if (isset(self::$prefixes[$namespace])) {
            return self::$prefixes[$namespace];
        }

        $prefix = apply_filters(self::PREFIX_FILTER, '', $namespace);

        if ($prefix === '' || $prefix === null) {
            return self::$prefixes[$namespace] = '';
        }

        if (!Spec::isValidApiId($prefix)) {
            SpecStore::addError(
                ['keyword' => self::PREFIX_FILTER],
                sprintf(
                    'The "%s" filter returned an invalid API ID prefix (%s) for "%s"; the namespace was described unprefixed.',
                    self::PREFIX_FILTER,
                    is_string($prefix) ? sprintf('"%s"', $prefix) : gettype($prefix),
                    $namespace,
                ),
            );

            return self::$prefixes[$namespace] = '';
        }

        return self::$prefixes[$namespace] = $prefix;
    }

    // ============================================================
    // ONE DECLARATION
    // ============================================================

    /**
     * @param array<int, string> $parameters
     * @return array<string, mixed>
     */
    private static function declare(
        string $apiId,
        string $namespace,
        string $route,
        string $path,
        string $method,
        string $operation,
        ?WP_REST_Controller $controller,
        ?string $schemaId,
        array $parameters,
    ): array {
        $lists = str_starts_with($operation, 'list');

        $declaration = [
            'id'        => $apiId,
            'operation' => $operation,
            'namespace' => $namespace,
            'route'     => $route,
            'method'    => $method,
            'summary'   => self::summary($operation, $apiId, $lists),
            // Handler errors are contributed separately through the same public
            // route-error channel integrations use.
            'errors'    => [],
            // Derivation hands back core's own validation and sanitization
            // callbacks, which a described route has nothing to put them on.
            'input'     => SchemaNormalizer::normalize(self::input($namespace, $route, $method, $parameters, $controller, $operation)),
            'responses' => self::responses($operation, $schemaId, $lists, $namespace, $route, $method),
        ];

        return $declaration;
    }

    /**
     * What the route accepts, from what core registered it with.
     *
     * @param array<int, string> $parameters
     * @return array<string, mixed>
     */
    private static function input(
        string $namespace,
        string $route,
        string $method,
        array $parameters,
        ?WP_REST_Controller $controller,
        string $operation,
    ): array {
        $registered = CoreRouteArgs::forRoute($namespace, $route, $method);
        $properties = [];

        // A path parameter is described by what core registered it as, not by
        // what a route regex looks like: `/comments/(?P<id>[\d]+)` registers `id`
        // as an integer, and typing it `string` because it arrived in the path
        // would publish a route no caller can reach with the value it holds.
        // Only a parameter core registered nothing for falls back, and it is
        // required either way — the route cannot match without it.
        foreach ($parameters as $name) {
            $declared = $registered[$name] ?? [
                'type'        => 'string',
                'description' => sprintf('The %s this route addresses.', str_replace('_', ' ', $name)),
            ];

            unset($registered[$name]);

            $declared['required'] = true;
            $properties[$name]    = $declared;
        }

        $input = [
            'type'       => 'object',
            'properties' => $properties + $registered,
        ];

        if (in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
            $input['content_type'] = $operation === 'create' && $controller instanceof WP_REST_Attachments_Controller
                // The attachments controller reads `$_FILES`, so its create is
                // the one route here that is not JSON.
                ? 'multipart/form-data'
                : Spec::JSON_CONTENT_TYPE;
        }

        return $input;
    }

    /**
     * @return array<array-key, mixed>
     */
    private static function responses(string $operation, ?string $schemaId, bool $lists, string $namespace, string $route, string $method): array
    {
        // Nothing published this route's shape, so the contract says that rather
        // than naming fields nobody declared. The route stays callable and the
        // caller gets an object it has to read for itself. Its arity is still
        // known: a collection answers with a list of those objects, so an
        // undescribed record does not cost the caller the array around it.
        $opaque = ['type' => 'object', 'additionalProperties' => true];
        $body   = match (true) {
            $schemaId === null && $lists => ['type' => 'array', 'items' => $opaque],
            $schemaId === null           => $opaque,
            $operation === 'delete'      => DeletedSchema::trashable($schemaId),
            $operation === 'delete_all'  => DeletedSchema::counted(),
            $lists                       => ['type' => 'array', 'items' => ['$ref' => $schemaId]],
            default                      => ['$ref' => $schemaId],
        };

        $success = $operation === 'create' ? '201' : '200';

        $description = $schemaId === null
            ? 'The result. Its fields are not described by the route registration.'
            : 'The result.';

        $responses = [$success => ['description' => $description, 'body' => $body]];

        if ($lists && self::paginates($namespace, $route, $method)) {
            $responses[$success]['headers'] = ManagedPostTypes::paginationHeaders();
        }

        return $responses;
    }

    /** A list paginates when core registered the parameters that page it. */
    private static function paginates(string $namespace, string $route, string $method): bool
    {
        $args = CoreRouteArgs::forRoute($namespace, $route, $method);

        return isset($args['page'], $args['per_page']);
    }

    private static function summary(string $operation, string $apiId, bool $lists): string
    {
        $noun = str_replace('.', ' ', $apiId);

        return match (true) {
            $lists                     => sprintf('List %s', $noun),
            $operation === 'create'    => sprintf('Create a %s record', $noun),
            $operation === 'update'    => sprintf('Update a %s record', $noun),
            $operation === 'delete'    => sprintf('Delete a %s record', $noun),
            $operation === 'delete_all' => sprintf('Delete every %s record', $noun),
            default                    => sprintf('%s on %s', ucfirst(str_replace('_', ' ', $operation)), $noun),
        };
    }

    // ============================================================
    // DERIVED SCHEMAS
    // ============================================================

    /**
     * The registered schema for a resource, reusing one already derived.
     *
     * Two API IDs can be the same shape: `/users` and `/users/me` are one
     * controller answering for a different subject, and describing the user twice
     * would double a large schema for nothing. Identical derivations are shared,
     * and a controller class that serves several registrations — every post type
     * goes through `WP_REST_Posts_Controller` — still gets one schema per
     * registration, because the derivations differ.
     *
     * @param array<string, array<string, mixed>> $schemas
     * @param array<string, string>               $byShape
     */
    private static function schema(
        array &$schemas,
        array &$byShape,
        string $apiId,
        string $prefix,
        ?object $subject,
        string $operation,
        string $path,
        string $namespace,
        string $route,
    ): ?string
    {
        if ($subject instanceof WP_REST_Controller) {
            // The normalized path deliberately omits the namespace. It cannot
            // identify the controller schema cache entry because two namespaces
            // may both register (for example) `/settings` with different shapes.
            $properties = CoreItemSchema::responseForController(
                $subject,
                sprintf('/%s%s', trim($namespace, '/'), $route),
                CoreResource::CONTEXT,
            );

            // Only the controller path is filtered. The filter has always been
            // handed a controller and its callers type it as one, so a route
            // without one is corrected through self::RESPONSE_FILTER instead.
            /** @var array<string, array<string, mixed>> $properties */
            $properties = apply_filters(self::SCHEMA_FILTER, $properties, $apiId, $subject, $operation, $path);
        } else {
            /** @var array<string, array<string, mixed>>|null $derived */
            $derived = apply_filters(self::RESPONSE_FILTER, null, $subject, $namespace, $route, $operation);

            $properties = is_array($derived) ? $derived : [];
        }

        // Nothing answered, whichever side was asked. A controller can publish no
        // schema at all, or one whose every property is filtered out of this
        // context, and an empty property set is not a shape: describing it as one
        // publishes "this response has no fields", which is an invented claim
        // rather than an honest unknown. It would also hand every empty
        // derivation in a prefix the same fingerprint below, so two unrelated
        // routes would share a schema and whichever claimed the ID first would
        // name it for both.
        if ($properties === []) {
            // A warning, not a failure: the route is in the document and a
            // caller can reach it. Only its fields are unknown.
            SpecStore::addWarning(
                ['path' => $path, 'keyword' => 'callback'],
                sprintf('Nothing describes the response of "%s", so it is described as an opaque object.', $path),
            );

            return null;
        }

        // A prefix owns its schema namespace. Reusing a structurally identical
        // schema across prefixes would make a core route point at a WooCommerce
        // schema (or one WooCommerce namespace point at the other), changing an
        // otherwise unrelated public contract according to discovery order.
        $fingerprint = sprintf('%s:%s', $prefix, md5((string) wp_json_encode($properties)));

        if (isset($byShape[$fingerprint])) {
            return $byShape[$fingerprint];
        }

        $id = self::schemaId($apiId, $prefix);

        if (isset($schemas[$id])) {
            $suffix = str_replace('_', '-', $operation);
            $id     .= '.' . $suffix;

            for ($copy = 2; isset($schemas[$id]); $copy++) {
                $id = sprintf('%s.%s-%d', self::schemaId($apiId, $prefix), $suffix, $copy);
            }
        }

        $schemas[$id] = [
            'type'        => 'object',
            'description' => sprintf('A %s record, as WordPress returns it.', str_replace('.', ' ', $apiId)),
            'properties'  => $properties,
        ];

        $byShape[$fingerprint] = $id;

        return $id;
    }

    /**
     * A described shape is WordPress's, and says so.
     *
     * Not `kizlo.`: that prefix is reserved for what this plugin serves, and
     * `Registry` only accepts it from a registration the spec store has marked
     * trusted. These arrive through a filter at document build instead, which is
     * the only moment the route table can answer, and they describe someone
     * else's records in any case.
     *
     * A namespace that named itself is already qualified, so it heads its own
     * schema rather than being buried under `wp.`: `wc/store/v1` prefixed with
     * `woocommerce.store` describes its cart as `woocommerce.store.cart`, not as
     * `wp.woocommerce-store-cart`.
     */
    private static function schemaId(string $apiId, string $prefix): string
    {
        $local = $prefix === '' ? $apiId : substr($apiId, strlen($prefix) + 1);
        $slug  = strtolower((string) preg_replace('/(?<!^)([A-Z])/', '-$1', str_replace('.', '-', $local)));

        return ($prefix === '' ? 'wp' : $prefix) . '.' . $slug;
    }

    /**
     * Whatever object serves the route, controller or not.
     *
     * `WP_REST_Controller` is the shape core registers its own routes with and
     * the only one this can read unaided. Anything else is handed to
     * {@see self::RESPONSE_FILTER}, which is how a Store API `AbstractRoute`
     * gets described by the integration that registered it.
     *
     * @param array<string, mixed> $handler
     */
    private static function subject(array $handler): ?object
    {
        $callback = $handler['callback'] ?? null;

        if (is_array($callback) && is_object($callback[0] ?? null)) {
            return $callback[0];
        }

        if ($callback instanceof \Closure) {
            $bound = (new \ReflectionFunction($callback))->getClosureThis();

            return $bound ?? $callback;
        }

        return is_object($callback) ? $callback : null;
    }
}
