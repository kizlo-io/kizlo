<?php

namespace Kizlo\Modules\Settings\Captcha;

use WP_REST_Request;
use WP_REST_Response;

final class CaptchaSettingsService
{
    public function register(): void
    {
        kizlo_register_route([
            'id' => 'kizlo.settings.captcha', 'operation' => 'update', 'method' => 'PUT', 'route' => '/settings/captcha',
            'summary' => 'Configure submission CAPTCHA verification', 'input' => self::schema(),
            'responses' => ['200' => ['body' => self::schema(true)]],
            'callback' => static function (WP_REST_Request $request): WP_REST_Response {
                $settings = CaptchaSettings::load();
                $settings->setData($request->get_json_params())->save();
                return new WP_REST_Response($settings->getData());
            },
        ]);
    }

    /** @return array<string, mixed> */
    public static function schema(bool $response = false): array
    {
        $schema = ['type' => 'object', 'additionalProperties' => false, 'properties' => [
            'provider' => ['type' => 'string', 'enum' => CaptchaSettings::PROVIDERS],
            'secret' => ['type' => 'string', 'maxLength' => 4096],
            'sitekey' => ['type' => 'string', 'maxLength' => 4096],
            'min_score' => ['type' => 'number', 'minimum' => 0, 'maximum' => 1],
        ]];
        if ($response) {
            foreach ($schema['properties'] as &$property) $property['required'] = true;
        }
        return $schema;
    }
}
