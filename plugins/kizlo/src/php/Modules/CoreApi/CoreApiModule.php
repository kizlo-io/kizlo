<?php

namespace Kizlo\Modules\CoreApi;

/**
 * The contracts for WordPress's own REST API.
 *
 * This module registers no endpoints and serves no requests. Everything under it
 * describes routes WordPress already serves, so that a caller reaching for
 * `wp/v2/posts` or `wp/v2/users` stays inside the generated client instead of
 * dropping out to a raw call.
 *
 * That makes every declaration here a claim about somebody else's API, and a
 * claim nothing can falsify at runtime: there is no callback to fail and no
 * request to reject. What keeps it true is `CoreRouteTest`, which compares each
 * described operation against the controller core registered, for every resource
 * rather than a sample.
 *
 * Registration waits for `rest_api_init` for the reason `CommentModule` and
 * `AppearanceModule` do: the descriptions derive from controllers and, for the
 * non-CRUD actions, from the route table itself, and neither exists earlier.
 *
 * One routes class and one schemas class per family, because forty resources in
 * one pair of files is a pair of files nobody can review.
 */
class CoreApiModule
{
    /** @var array<int, class-string> */
    private const FAMILIES = [
        ContentRoutes::class,
        IdentityRoutes::class,
    ];

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'describe']);
    }

    public function describe(): void
    {
        foreach (self::FAMILIES as $family) {
            /** @var callable(): void */
            $register = [$family, 'register'];
            $register();
        }
    }

    /**
     * Every schema the described families contribute.
     *
     * Reached through {@see \Kizlo\Modules\Introspection\CoreSchemas::all()} rather
     * than `kizlo_register_route_schema()`, for the reason that class gives: a
     * core schema has to be present whenever a route's input is translated, which
     * is every REST request, while the public helper only holds what a
     * contributing plugin has loaded.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function schemas(): array
    {
        return ContentSchemas::all() + IdentitySchemas::all();
    }
}
