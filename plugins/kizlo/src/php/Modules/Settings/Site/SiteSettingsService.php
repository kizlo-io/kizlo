<?php

namespace Kizlo\Modules\Settings\Site;

use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Settings\SettingsSchemas;
use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;

class SiteSettingsService
{
    /**
     * Register site settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register GET and PUT routes for site settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'id'        => 'settings.site',
            'operation' => 'update',
            'method'    => 'PUT',
            'route'     => '/settings/site',
            'summary'   => 'Update the site settings',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'url'                       => ['type' => 'string', 'nullable' => true, 'format' => 'uri'],
                    'backend_url'               => ['type' => 'string', 'nullable' => true, 'format' => 'uri'],
                    'secret'                    => ['type' => 'string', 'nullable' => true],
                    'name'                      => ['type' => 'string', 'nullable' => true],
                    'alternate_name'            => ['type' => 'string', 'nullable' => true],
                    'tagline'                   => ['type' => 'string', 'nullable' => true],
                    'title_separator'           => ['type' => 'string', 'enum' => SiteSettings::TITLE_SEPARATORS],
                    'fallback_image'            => ['type' => 'integer', 'nullable' => true, 'description' => 'Attachment ID.'],
                    'search_action_structure'   => ['type' => 'string', 'nullable' => true],
                    'discourage_search_engines' => ['type' => 'boolean'],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The saved site settings.', 'body' => ['$ref' => SettingsSchemas::SITE]],
                '400' => ['description' => 'A URL, media ID or separator was rejected.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => function (WP_REST_Request $request) {
                $settings = SiteSettings::load();
                $settings->setData($request->get_json_params());
                $settings->save();

                Webhook::sendEvent(Webhook::SETTINGS_SITE_UPDATED_EVENT);

                return new WP_REST_Response($this->toResponse($settings));
            },
        ]);
    }

    public function toResponse(SiteSettings $settings): array
    {
        $data = $settings->getData();

        if (!empty($data['fallback_image'])) {
            $data['fallback_image'] = kizlo_ensure_media_data($data['fallback_image']);
        }

        return $data;
    }
}
