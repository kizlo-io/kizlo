<?php

namespace Kizlo\Modules\Introspection;

/**
 * The arguments core registered one route with.
 *
 * {@see CoreCollectionParams} answers this for a list and {@see CoreItemSchema}
 * for a write, because both have a controller method that is the complete answer:
 * `get_collection_params()` and `get_endpoint_args_for_item_schema()`. A route
 * that is neither has no such method. `/media/{id}/edit` takes a crop, a rotation
 * and a caption; `/widget-types/{id}/encode` takes form data; `/templates/lookup`
 * takes a slug and a template hierarchy. None of that comes off the item schema,
 * and core keeps it only in the `args` it passed to `register_rest_route()`.
 *
 * So that registration is read back. It is the same argument the other two make:
 * the route's own declaration is the only complete answer to what it accepts, and
 * a hand-written list beside it is a second source that nothing reconciles.
 *
 * Reading the route table means this can only be asked after `rest_api_init`,
 * which is where {@see \Kizlo\Modules\CoreApi\CoreApiModule} registers and when
 * the declaration factories are materialized.
 */
final class CoreRouteArgs
{
    /** @var array<string, array<string, array<string, mixed>>> */
    private static array $memo = [];

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function forRoute(string $namespace, string $route, string $method): array
    {
        $key = sprintf('%s|%s|%s', $namespace, $route, $method);

        return self::$memo[$key] ??= self::translate($namespace, $route, $method);
    }

    public static function flush(): void
    {
        self::$memo = [];
    }

    /**
     * Whether WordPress is actually serving this route here.
     *
     * Some core routes are conditional. `WP_REST_Attachments_Controller` registers
     * `/media/{id}/sideload` and `/media/{id}/finalize` only when
     * `wp_is_client_side_media_processing_enabled()` is on. Describing one
     * unconditionally would claim a route half the sites in the world do not
     * serve, and the contract is generated against one WordPress, so the honest
     * answer is to ask that WordPress.
     */
    public static function isRegistered(string $namespace, string $route, string $method): bool
    {
        $full = sprintf('/%s%s', trim($namespace, '/'), $route);

        foreach (rest_get_server()->get_routes()[$full] ?? [] as $handler) {
            if (is_array($handler) && ($handler['methods'][$method] ?? false) === true) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function translate(string $namespace, string $route, string $method): array
    {
        $full  = sprintf('/%s%s', trim($namespace, '/'), $route);
        $args  = [];
        $found = false;

        foreach (rest_get_server()->get_routes()[$full] ?? [] as $handler) {
            if (!is_array($handler) || ($handler['methods'][$method] ?? false) !== true) {
                continue;
            }

            $found = true;

            if (is_array($handler['args'] ?? null)) {
                $args += $handler['args'];
            }
        }

        if (!$found) {
            // The description claims a route WordPress is not serving. Nothing
            // else would notice: a described route has no handler to fail.
            SpecStore::addError(
                ['path' => $route, 'keyword' => $method],
                sprintf('No %s handler is registered at "%s", so the described route does not exist.', $method, $full),
            );

            return [];
        }

        unset($args['context']);

        return CoreSchemaTranslator::properties(
            $args,
            static function (string $name) use ($route): void {
                SpecStore::addError(
                    ['path' => $route, 'keyword' => $name],
                    sprintf(
                        'The "%s" argument cannot be expressed as a schema, so the route accepts it undescribed. It was added to WordPress from outside Kizlo.',
                        $name,
                    ),
                );
            },
        );
    }
}
