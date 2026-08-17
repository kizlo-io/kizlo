<?php

namespace Kizlo\Modules\RestApi;

use Kizlo\Modules\Extension\Extensions;
use WP_REST_Response;

class RestApiModule
{
    public function register(): void
    {
        (new RestGuard())->register();
        $this->stampVersionHeader();
        $this->stampExtensionsHeader();
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

    /**
     * Stamp the extension plugins that started as `X-Kizlo-Extensions`, e.g.
     * `kizlo-woocommerce=0.2.0`.
     *
     * The client half of an extension ships separately from the WordPress half
     * and needs the same "is it new enough" answer `X-Kizlo-Version` gives it
     * for core. It rides the responses the runtime already makes, so it costs
     * no extra request, and it names only extensions that passed their
     * requirements: one that was blocked registered nothing, so advertising it
     * would promise a contract that is not there.
     */
    private function stampExtensionsHeader(): void
    {
        add_filter('rest_post_dispatch', static function (mixed $response): mixed {
            $booted = Extensions::booted();

            if ($response instanceof WP_REST_Response && $booted !== []) {
                $pairs = [];
                foreach ($booted as $slug => $version) $pairs[] = $slug . '=' . $version;

                $response->header('X-Kizlo-Extensions', implode(',', $pairs));
            }

            return $response;
        });
    }
}
