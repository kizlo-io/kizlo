<?php

namespace Kizlo\Modules\RestApi;

use WP_Error;
use WP_REST_Request;

/**
 * Request-aware REST API lockdown.
 *
 * Kizlo runs as a server-to-server headless adapter: the SDK on the
 * application server is the only client that should ever reach this site's
 * REST API. End-user browsers, public crawlers, exploratory tools, and any
 * other unauthenticated caller have no legitimate reason to hit /wp-json/*.
 *
 * The lockdown is unconditional and intentional: cart routes accept a
 * X-Kizlo-User-Email header that is trusted without cryptographic verification,
 * so opening the API to anonymous callers would let anyone act as any user.
 * The trust boundary is HTTP Basic auth with an admin Application Password —
 * everything past it is treated as a legitimate request from the SDK.
 *
 * Routes are protected by default. Integrations may make a narrow route family
 * public with `kizlo_rest_route_requires_admin`; Kizlo-owned routes stay behind
 * this guard.
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

        if ($request instanceof WP_REST_Request) {
            /**
             * Whether this REST route requires an administrator authenticated
             * with a WordPress Application Password.
             *
             * @param bool            $required Protected by default.
             * @param WP_REST_Request $request  The current REST request.
             */
            $required = str_starts_with($request->get_route(), '/kizlo/')
                || (bool) apply_filters('kizlo_rest_route_requires_admin', true, $request);
            if (! $required) return $result;
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
