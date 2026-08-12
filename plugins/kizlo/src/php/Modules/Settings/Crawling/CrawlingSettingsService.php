<?php

namespace Kizlo\Modules\Settings\Crawling;

use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Settings\SettingsSchemas;
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
            'id'        => 'settings.crawling',
            'operation' => 'update',
            'methods'   => 'PUT',
            'route'     => '/settings/crawling',
            'summary'   => 'Update the robots.txt settings',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'robots' => [
                        'type'       => 'object',
                        'properties' => [
                            'include_sitemap' => ['type' => 'boolean'],
                            'custom_rules'    => [
                                'type'  => 'array',
                                'items' => [
                                    'type'       => 'object',
                                    'properties' => [
                                        'user_agent' => ['type' => 'string', 'required' => true],
                                        'rule'       => ['type' => 'string', 'required' => true, 'enum' => ['allow', 'disallow']],
                                        'path'       => ['type' => 'string', 'required' => true],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The saved crawling settings.', 'body' => ['$ref' => SettingsSchemas::CRAWLING]],
                '400' => ['description' => 'Invalid request.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => function (WP_REST_Request $request) {
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
