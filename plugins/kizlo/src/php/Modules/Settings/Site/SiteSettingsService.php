<?php

namespace Kizlo\Modules\Settings\Site;

use Kizlo\Modules\Settings\Settings;
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
            'methods'  => 'PUT',
            'route'    => '/settings/site',
            'callback' => function (WP_REST_Request $request) {
                $settings = SiteSettings::load();
                $settings->setData($request->get_json_params());
                $settings->save();

                return new WP_REST_Response(null, 204);
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
