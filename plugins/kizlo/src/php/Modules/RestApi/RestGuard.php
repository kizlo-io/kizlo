<?php

namespace Kizlo\Modules\RestApi;

use WP_Error;

/**
 * Global REST API lockdown.
 *
 * Kizlo runs as a server-to-server headless adapter: the SDK on the
 * application server is the only client that should ever reach this site's
 * REST API. End-user browsers, public crawlers, exploratory tools, and any
 * other unauthenticated caller have no legitimate reason to hit /wp-json/*.
 *
 * The lockdown is unconditional and intentional: cart routes accept a
 * X-Kizlo-User-Id header that is trusted without cryptographic verification,
 * so opening the API to anonymous callers would let anyone act as any user.
 * The trust boundary is HTTP Basic auth with an admin Application Password —
 * everything past it is treated as a legitimate request from the SDK.
 *
 * Covers every namespace — wp/v2, wc/v3, wc/store/v1, kizlo/v1, and anything
 * else a plugin registers — without per-route changes. OPTIONS preflights and
 * the /wp-json/ index are intentionally included.
 */
class RestGuard
{
    public function register(): void
    {
        add_filter('rest_authentication_errors', [$this, 'requireAdmin'], 100);
    }

    public function requireAdmin(mixed $result): mixed
    {
        if (is_wp_error($result)) return $result;

        if (! is_user_logged_in()) {
            return new WP_Error(
                'kizlo_rest_unauthorized',
                'Authentication required.',
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
}
