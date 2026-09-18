<?php

namespace Kizlo\Modules\Introspection;

use WeakMap;
use WP_Error;
use WP_REST_Request;

/**
 * What a managed write route already knows about itself, carried from
 * registration through to the code that validates and persists the write.
 *
 * Neither fact survives the trip any other way. {@see \Kizlo\Modules\PostType\PostTypeApi}
 * registers one route per managed slug, so the slug is a literal path segment
 * rather than a request argument, and whether a write is partial follows from
 * which operation was declared rather than from the HTTP method. Recovering
 * either at request time is exactly what silently switched custom-field
 * validation off when the generic `/post-types/:post_type` route was replaced.
 *
 * The check is mounted as a route-level `validate_callback` rather than a
 * per-argument one, because `WP_REST_Request::has_valid_params()` returns this
 * one's `WP_Error` verbatim while wrapping a per-argument one into
 * `rest_invalid_param`, which would demote a declared error code such as
 * `kizlo_custom_fields_invalid` to `details`. It runs after the per-argument
 * schema validation, so a violation of the published contract still answers
 * first.
 */
final class ManagedWrite
{
    public const POST_TYPE = 'post_type';
    public const TAXONOMY  = 'taxonomy';

    /**
     * The requests that reached a managed write route.
     *
     * `rest_after_insert_{type}` is keyed on the post type or taxonomy, so it
     * also fires for core's own `/wp/v2/*` routes, which never declared the
     * `kizlo` envelope and never passed through this check. Persisting the
     * payload there anyway would make core's routes a second, undocumented
     * authoring path where a bad value is a silent no-op rather than the 400 the
     * contract promises. The marker is written and read by this one class, so it
     * cannot drift the way a separately derived route check can.
     *
     * @var WeakMap<WP_REST_Request, self>|null
     */
    private static ?WeakMap $validated = null;

    public function __construct(
        public readonly string $family,
        public readonly string $slug,
        public readonly bool $partial,
    ) {
    }

    /**
     * The route-level `validate_callback` for this write.
     */
    public function callback(): callable
    {
        return function (WP_REST_Request $request): bool|WP_Error {
            $validated = self::map();
            $validated[$request] = $this;

            // `has_valid_params()` runs inside `dispatch()` before
            // `respond_to_request()` reaches the route's `permission_callback`,
            // and an error returned here skips that check altogether. Without
            // this guard the attachment lookups behind the filter would run for
            // anonymous callers, and answering 400 for an ID that is not an
            // image while a valid one passes would tell a logged-out caller
            // which attachment IDs exist. Defer to the route's own 401/403.
            if (!current_user_can('manage_options')) {
                return true;
            }

            $valid = apply_filters('kizlo_validate_managed_write', true, $this, $request);

            return $valid instanceof WP_Error ? $valid : true;
        };
    }

    /**
     * The managed write this request was dispatched as, or null when it never
     * reached one.
     */
    public static function forRequest(WP_REST_Request $request): ?self
    {
        return self::map()[$request] ?? null;
    }

    /** @return WeakMap<WP_REST_Request, self> */
    private static function map(): WeakMap
    {
        return self::$validated ??= new WeakMap();
    }
}
