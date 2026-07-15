<?php

namespace Kizlo\Modules\Settings\Integration;

use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;

class IntegrationSettingsService
{
    /**
     * Register integration settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register GET and PUT routes for integration settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => '/settings/webhook',
            'callback' => function (WP_REST_Request $request) {
                $settings = WebhookSettings::load();
                $settings->setData($request->get_json_params());
                $settings->save();

                Webhook::sendEvent(Webhook::SETTINGS_INTEGRATION_UPDATED_EVENT);

                return new WP_REST_Response(null, 204);
            },
        ]);
    }

    /**
     * Get all integration settings data for aggregated response.
     *
     * @return array<string, mixed>
     */
    public function toResponse(WebhookSettings $webhook): array
    {
        return [
            'webhook' => [
                'post_types'   => $webhook->getPostTypes(),
                'taxonomies'   => $webhook->getTaxonomies(),
                'webhook_urls' => $webhook->getWebhookUrls(),
            ],
        ];
    }
}
