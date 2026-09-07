<?php

namespace Kizlo\Modules\RestApi;

use WP_Error;
use WP_REST_Request;

/**
 * Request-aware REST API lockdown for the unverified-identity-header surface.
 *
 * Some routes act on an `X-Kizlo-User-Email` header trusted without
 * cryptographic verification — the WooCommerce Store API cart routes are the
 * case in point — so opening them to anonymous callers would let anyone act as
 * any user. The guard locks those routes to an administrator authenticated with
 * a WordPress Application Password, the boundary that makes the header safe.
 *
 * Nothing is protected by default. A route family opts in with
 * `kizlo_rest_route_requires_admin`; see {@see self::protectsRoute()}. Kizlo's
 * own `/kizlo/*` routes are not guarded here — each carries a
 * `permission_callback` (see {@see \Kizlo\Modules\Introspection\RouteRegistrar})
 * that enforces the administrator capability and returns the same
 * `kizlo_rest_unauthorized`/`kizlo_rest_forbidden` codes, while accepting any
 * WordPress authentication (cookie + nonce as well as Application Password).
 */
class RestGuard
{
    public function register(): void
    {
        add_filter('rest_request_before_callbacks', [$this, 'requireAdmin'], 0, 3);
    }

    public function requireAdmin(mixed $result, mixed $handler = null, mixed $request = null): mixed
    {
        if (is_wp_error($result)) return $result;

        if ($request instanceof WP_REST_Request && ! self::protectsRoute($request)) {
            return $result;
        }

        if (! self::isApplicationPasswordAuthenticated() || ! is_user_logged_in()) {
            return new WP_Error(
                'kizlo_rest_unauthorized',
                'Administrator Application Password authentication required.',
                ['status' => 401]
            );
        }

        if (! current_user_can('manage_options')) {
            return new WP_Error(
                'kizlo_rest_forbidden',
                'Administrator privileges required.',
                ['status' => 403]
            );
        }

        return $result;
    }

    /**
     * Whether the Kizlo guard protects this route.
     *
     * Nothing is guarded by default: every route defers to its own permission
     * callbacks, so the block editor, the admin dashboard, third-party plugins,
     * and Kizlo's own `/kizlo/*` routes keep authenticating their REST requests
     * the way they always have. An integration opts a narrow route family in —
     * the WooCommerce Store API does, so its unverified X-Kizlo-User-Email
     * header stays behind the administrator Application Password boundary.
     *
     * This is the single source of truth for the guard's route policy: the
     * introspection contract reads it too, so a described route advertises the
     * guard's `kizlo_rest_unauthorized`/`kizlo_rest_forbidden` errors exactly
     * when the guard would return them.
     */
    public static function protectsRoute(WP_REST_Request $request): bool
    {
        /**
         * Whether a non-Kizlo REST route requires an administrator authenticated
         * with a WordPress Application Password. False by default: native and
         * third-party routes use their own authentication and capability checks.
         *
         * @param bool            $required Defer to native permissions by default.
         * @param WP_REST_Request $request  The current REST request.
         */
        return (bool) apply_filters('kizlo_rest_route_requires_admin', false, $request);
    }

    /**
     * WordPress sets this request-global only after an Application Password has
     * been successfully verified. It deliberately identifies the mechanism,
     * not a particular credential UUID, so passwords remain independently
     * rotatable.
     */
    public static function isApplicationPasswordAuthenticated(): bool
    {
        global $wp_rest_application_password_uuid;

        return is_string($wp_rest_application_password_uuid)
            && $wp_rest_application_password_uuid !== '';
    }
}
