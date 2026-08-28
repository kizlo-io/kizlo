<?php

namespace Kizlo\Modules\Settings\Brand;

use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Settings\SettingsSchemas;
use Kizlo\Modules\Webhook\Webhook;
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
        'app_icon',
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
            'id'        => 'settings.brand',
            'operation' => 'update',
            'method'    => 'PUT',
            'route'     => '/settings/brand',
            'summary'   => 'Update the brand settings',
            'input'     => $this->input(),
            'responses' => [
                '200' => ['description' => 'The saved brand settings.', 'body' => ['$ref' => SettingsSchemas::BRAND]],
                '400' => ['description' => 'A media ID or color was rejected.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => function (WP_REST_Request $request) {
                $settings = BrandSettings::load();
                $settings->setData($request->get_json_params());
                $settings->save();

                Webhook::sendEvent(Webhook::SETTINGS_BRAND_UPDATED_EVENT);

                return new WP_REST_Response($this->toResponse($settings));
            },
        ]);
    }

    /**
     * A partial write: every property is optional, and each media field is the
     * attachment ID that gets stored rather than the object it reads back as.
     *
     * @return array<string, mixed>
     */
    private function input(): array
    {
        $properties = [];

        foreach (self::MEDIA_KEYS as $key) {
            $properties[$key] = ['type' => 'integer', 'nullable' => true, 'description' => 'Attachment ID.'];
        }

        foreach (['theme_color', 'theme_color_dark', 'background_color'] as $key) {
            $properties[$key] = ['type' => 'string', 'nullable' => true, 'description' => 'Hex color.'];
        }

        return ['type' => 'object', 'properties' => $properties];
    }

    public function toResponse(BrandSettings $settings): array
    {
        $data = $settings->getData();

        foreach (self::MEDIA_KEYS as $key) {
            if (!empty($data[$key])) {
                $data[$key] = kizlo_ensure_media_image_data($data[$key]);
            }
        }

        return $data;
    }
}
