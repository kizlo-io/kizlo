<?php

namespace Kizlo\Modules\Settings\Crawling;

use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;

class CrawlingSettingsService
{
    /**
     * Register identity settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register GET and PUT routes for identity settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => '/settings/crawling',
            'callback' => function (WP_REST_Request $request) {
                $data = $request->get_json_params();

                $crawling = CrawlingSettings::load();

                if (isset($data['robots'])) {
                    $crawling->robots->setData($data['robots'])->save();
                }

                Webhook::sendEvent(Webhook::SETTINGS_CRAWLING_UPDATED_EVENT);

                return new WP_REST_Response($this->toResponse($crawling));
            },
        ]);
    }

    public function toResponse(CrawlingSettings $settings): array
    {
        return $settings->getData();
    }
}
