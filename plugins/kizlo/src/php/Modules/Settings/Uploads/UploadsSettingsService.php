<?php

namespace Kizlo\Modules\Settings\Uploads;

use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Settings\SettingsSchemas;
use WP_REST_Request;
use WP_REST_Response;

class UploadsSettingsService
{
    /**
     * Register uploads settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register the PUT route for uploads settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'id'        => 'settings.uploads',
            'operation' => 'update',
            'method'    => 'PUT',
            'route'     => '/settings/uploads',
            'summary'   => 'Update the allowed upload types',
            'input'     => [
                'type'       => 'object',
                'properties' => SettingsSchemas::optionalProperties(SettingsSchemas::UPLOADS),
            ],
            'responses' => [
                '200' => ['description' => 'The saved upload settings.', 'body' => ['$ref' => SettingsSchemas::UPLOADS]],
                '400' => ['description' => 'An extension or MIME type was rejected.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => function (WP_REST_Request $request) {
                $data = $request->get_json_params();

                $settings = UploadsSettings::load();
                $settings->setData($data)->save();

                return new WP_REST_Response($this->toResponse($settings));
            },
        ]);
    }

    public function toResponse(UploadsSettings $settings): array
    {
        return $settings->getData();
    }
}
