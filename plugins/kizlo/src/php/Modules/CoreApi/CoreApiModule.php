<?php

namespace Kizlo\Modules\CoreApi;

/**
 * The contract for WordPress's own REST API.
 *
 * This module registers no endpoints and serves no requests. It describes routes
 * WordPress already serves, so a caller reaching for `wp/v2/posts` or
 * `wp/v2/users` stays inside the generated client instead of dropping out to a
 * raw request. {@see RouteDiscovery} does the describing; this is the wiring.
 *
 * Every declaration is a claim about somebody else's API, and one nothing can
 * falsify at runtime: there is no callback to fail and no request to reject. What
 * keeps it true is that it is derived from the route table rather than written,
 * and `CoreRouteTest` compares the result back against that same table.
 *
 * ## Why this contributes through a filter rather than on `rest_api_init`
 *
 * The route table is the entire input, and during `rest_api_init` there is no
 * finished route table to read. `rest_get_server()` is what *fires* that hook, so
 * asking it for routes from inside a callback on it re-enters it: the server is
 * built, the hook runs again nested, and whichever pass reads first sees a
 * half-filled table. Registering a factory on `rest_api_init` would therefore
 * describe whatever happened to be registered by then, which is a race rather
 * than a contract.
 *
 * `kizlo_introspection_routes` is applied when the document is built, which is
 * after every route on `rest_api_init` exists and the server is long since
 * constructed. That is the only point where the question has a stable answer.
 * Core's handler errors use the same timing and the same public collection
 * filter as an integration's route-error registrations.
 */
class CoreApiModule
{
    public function register(): void
    {
        // Last on the hook, so every route registered on it already exists.
        add_action('rest_api_init', [RouteDiscovery::class, 'arm'], PHP_INT_MAX);

        add_filter('kizlo_introspection_routes', [$this, 'describe']);
        add_filter('kizlo_introspection_schemas', [$this, 'describeSchemas']);
        add_filter('kizlo_introspection_route_errors', [CoreRouteErrors::class, 'register']);
    }

    /**
     * @param array<int, mixed> $routes
     * @return array<int, mixed>
     */
    public function describe(array $routes): array
    {
        return array_merge($routes, RouteDiscovery::declarations());
    }

    /**
     * The shapes the described routes answer with.
     *
     * Contributed here rather than through
     * {@see \Kizlo\Modules\Introspection\CoreSchemas::all()}, which memoizes
     * the first time a route's arguments are translated — during Kizlo's own
     * registration, long before core has registered the routes these are derived
     * from. A schema added after that would never be seen.
     *
     * @param array<int, mixed> $schemas
     * @return array<int, mixed>
     */
    public function describeSchemas(array $schemas): array
    {
        foreach (RouteDiscovery::schemas() as $id => $schema) {
            $schemas[] = ['id' => $id, 'schema' => $schema];
        }

        return $schemas;
    }
}
