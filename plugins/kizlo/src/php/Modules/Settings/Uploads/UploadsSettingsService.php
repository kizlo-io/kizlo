<?php

namespace Kizlo\Modules\Settings\Uploads;

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
            'methods'  => 'PUT',
            'route'    => '/settings/uploads',
            'callback' => function (WP_REST_Request $request) {
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
