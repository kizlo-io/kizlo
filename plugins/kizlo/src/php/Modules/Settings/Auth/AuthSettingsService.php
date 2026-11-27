<?php

namespace Kizlo\Modules\Settings\Auth;

use Kizlo\Modules\Auth\AuthConfiguration;
use WP_REST_Request;
use WP_REST_Response;

final class AuthSettingsService
{
    public function register(): void
    {
        kizlo_register_route([
            'id' => 'kizlo.settings.auth',
            'operation' => 'update',
            'method' => 'PUT',
            'route' => '/settings/auth',
            'summary' => 'Configure external JWT authentication',
            'input' => self::schema(),
            'responses' => ['200' => ['body' => self::schema(true)]],
            'callback' => static function (WP_REST_Request $request): WP_REST_Response {
                $settings = AuthSettings::load();
                $input = $request->get_json_params();
                $data = AuthConfiguration::normalize(array_replace($settings->getData(), $input));
                $settings->setData($data)->save();
                return new WP_REST_Response($settings->getData());
            },
        ]);
    }

    /** @return array<string, mixed> */
    public static function schema(bool $response = false): array
    {
        $properties = [];
        foreach (AuthConfiguration::defaults() as $key => $default) {
            $properties[$key] = match ($key) {
                'provider' => ['type' => 'string', 'enum' => ['disabled', 'clerk', 'kinde', 'custom']],
                'key_source' => ['type' => 'string', 'enum' => ['jwks', 'public_key']],
                'algorithm' => ['type' => 'string', 'enum' => ['RS256', 'ES256']],
                'clock_tolerance' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 60],
                'allowed_origins', 'authorized_parties' => ['type' => 'array', 'items' => ['type' => 'string']],
                'required_claims' => ['type' => 'array', 'maxItems' => 20, 'items' => [
                    'type' => 'object',
                    'properties' => [
                        'claim' => ['type' => 'string', 'required' => true],
                        'operator' => ['type' => 'string', 'required' => true, 'enum' => ['present', 'equals', 'one_of', 'contains']],
                        'value' => ['nullable' => true, 'anyOf' => [
                            ['type' => 'string'], ['type' => 'number'], ['type' => 'boolean'],
                            ['type' => 'array', 'items' => ['nullable' => true, 'anyOf' => [
                                ['type' => 'string'], ['type' => 'number'], ['type' => 'boolean'],
                            ]]],
                        ]],
                    ],
                ]],
                default => ['type' => 'string'],
            };
            if ($response) $properties[$key]['required'] = true;
        }
        return ['type' => 'object', 'properties' => $properties, 'additionalProperties' => false];
    }
}
