<?php

namespace Kizlo\Modules\Settings\Webhook;

use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;

class WebhookSettingsService
{
    /**
     * Register webhook settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register the PUT route for webhook settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => '/settings/webhook',
            'callback' => function (WP_REST_Request $request) {
                $settings = WebhookSettings::load();
                $settings->setData($request->get_json_params())->save();

                Webhook::sendEvent(Webhook::SETTINGS_INTEGRATION_UPDATED_EVENT);

                return new WP_REST_Response($this->toResponse($settings));
            },
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function toResponse(WebhookSettings $settings): array
    {
        return [
            'post_types'   => $settings->getPostTypes(),
            'taxonomies'   => $settings->getTaxonomies(),
            'webhook_urls' => $settings->getWebhookUrls(),
        ];
    }
}
