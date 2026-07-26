<?php

namespace Kizlo\Modules\RestApi;

use WP_REST_Response;

class RestApiModule
{
    public function register(): void
    {
        (new RestGuard())->register();
        $this->stampVersionHeader();
    }

    /**
     * Stamp the plugin version on every REST response as `X-Kizlo-Version`.
     *
     * The Kizlo client reads this off the responses it already makes (no extra request) to detect a
     * plugin older than it needs and tell the user to update. Applied to every REST response — not just
     * kizlo/v1 — because the client also calls wp/v2 and wc/* routes; an absent header signals a plugin
     * that predates this feature.
     */
    private function stampVersionHeader(): void
    {
        add_filter('rest_post_dispatch', static function (mixed $response): mixed {
            if ($response instanceof WP_REST_Response) {
                $response->header('X-Kizlo-Version', KIZLO_VERSION);
            }
            return $response;
        });
    }
}
