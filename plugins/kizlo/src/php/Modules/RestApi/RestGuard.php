<?php

namespace Kizlo\Modules\RestApi;

use WP_Error;
use WP_REST_Request;

/**
 * Request-aware REST API lockdown for Kizlo's own surface.
 *
 * Kizlo runs as a server-to-server headless adapter: the SDK on the
 * application server is the only client that should reach a Kizlo route. Those
 * routes are locked to an administrator authenticated with a WordPress
 * Application Password, because some of them (the WooCommerce cart routes) act
 * on an X-Kizlo-User-Email header trusted without cryptographic verification —
 * opening them to anonymous callers would let anyone act as any user.
 *
 * The guard is scoped to that surface. Kizlo-owned routes (`/kizlo/*`) are
 * always protected; every other route — WordPress's own `/wp/v2/*` block-editor
 * endpoints, the admin dashboard, third-party plugins — keeps its native
 * authentication and capability callbacks. An integration opts a sensitive
 * route family back in with `kizlo_rest_route_requires_admin`; see
 * {@see self::protectsRoute()}.
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
     * Kizlo-owned routes (`/kizlo/*`) are always behind the administrator
     * Application Password. Every other route defers to its own permission
     * callbacks by default, so the block editor, the admin dashboard, and
     * third-party plugins keep authenticating their REST requests the way they
     * always have. An integration may opt a narrow route family back into this
     * guard — the WooCommerce Store API does, so its unverified
     * X-Kizlo-User-Email header stays behind the admin boundary.
     *
     * This is the single source of truth for the guard's route policy: the
     * introspection contract reads it too, so a described route advertises the
     * guard's `kizlo_rest_unauthorized`/`kizlo_rest_forbidden` errors exactly
     * when the guard would return them.
     */
    public static function protectsRoute(WP_REST_Request $request): bool
    {
        if (str_starts_with($request->get_route(), '/kizlo/')) {
            return true;
        }

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
