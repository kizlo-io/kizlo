<?php

namespace Kizlo\Modules\Settings\Webhook;

use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Settings\SettingsSchemas;
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
            'id'        => 'settings.webhook',
            'operation' => 'update',
            'method'    => 'PUT',
            'route'     => '/settings/webhook',
            'summary'   => 'Update the webhook settings',

            // The watched lists are sent as the full set of checked slugs. What
            // gets stored is the difference from the hook defaults, which is why
            // the response can return slugs this request never mentioned.
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'post_types'   => ['type' => 'array', 'description' => 'Checked post type slugs.', 'items' => ['type' => 'string']],
                    'taxonomies'   => ['type' => 'array', 'description' => 'Checked taxonomy slugs.', 'items' => ['type' => 'string']],
                    'webhook_urls' => ['type' => 'array', 'items' => ['type' => 'string', 'format' => 'uri']],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The saved webhook settings.', 'body' => ['$ref' => SettingsSchemas::WEBHOOK]],
                '400' => ['description' => 'A webhook URL was rejected.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => function (WP_REST_Request $request) {
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
