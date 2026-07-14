<?php

namespace Kizlo\Modules\Settings\Brand;

use WP_REST_Request;
use WP_REST_Response;

class BrandSettingsService
{
    /**
     * Media fields resolved to full attachment data in the response.
     *
     * @var string[]
     */
    private const MEDIA_KEYS = [
        'logo',
        'logo_dark',
        'logo_icon',
        'logo_icon_dark',
        'logo_wordmark',
        'logo_wordmark_dark',
        'favicon',
        'favicon_dark',
        'apple_touch_icon',
    ];

    /**
     * Register brand settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register the PUT route for brand settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => '/settings/brand',
            'callback' => function (WP_REST_Request $request) {
                $settings = BrandSettings::load();
                $settings->setData($request->get_json_params());
                $settings->save();

                return new WP_REST_Response(null, 204);
            },
        ]);
    }

    public function toResponse(BrandSettings $settings): array
    {
        $data = $settings->getData();

        foreach (self::MEDIA_KEYS as $key) {
            if (!empty($data[$key])) {
                $data[$key] = kizlo_ensure_media_data($data[$key]);
            }
        }

        return $data;
    }
}
