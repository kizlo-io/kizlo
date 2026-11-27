<?php

namespace Kizlo\Modules\Captcha;

use Kizlo\Modules\Settings\Captcha\CaptchaSettings;
use WP_Error;
use WP_REST_Response;

/** Self-contained ALTCHA v1 challenges for frontends without an application server. */
final class Challenge
{
    public function register(): void
    {
        $properties = [];
        foreach (['algorithm', 'challenge', 'salt', 'signature'] as $name) $properties[$name] = ['type' => 'string', 'required' => true];
        $properties['maxnumber'] = ['type' => 'integer', 'required' => true];
        kizlo_register_route([
            'id' => 'kizlo.captcha.challenge', 'operation' => 'retrieve', 'access' => 'public', 'method' => 'GET',
            'input' => ['type' => 'object', 'properties' => []],
            'route' => '/captcha/challenge', 'summary' => 'Create a single-use ALTCHA v1 challenge',
            'errors' => ['kizlo_captcha_unavailable'],
            'responses' => [
                '200' => ['body' => ['type' => 'object', 'properties' => $properties]],
                '503' => ['body' => ['$ref' => 'kizlo.error']],
            ],
            'callback' => [$this, 'retrieve'],
        ]);
    }

    public function retrieve(): WP_REST_Response|WP_Error
    {
        $settings = CaptchaSettings::load()->getData();
        if ($settings['provider'] !== 'altcha' || $settings['secret'] === '') {
            return new WP_Error('kizlo_captcha_unavailable', 'ALTCHA is not configured.', ['status' => 503]);
        }
        $salt = bin2hex(random_bytes(16)) . '?expires=' . (time() + 300);
        $maximum = 100000;
        $challenge = hash('sha256', $salt . random_int(0, $maximum));
        $response = new WP_REST_Response([
            'algorithm' => 'SHA-256', 'challenge' => $challenge, 'salt' => $salt,
            'signature' => hash_hmac('sha256', $challenge, $settings['secret']), 'maxnumber' => $maximum,
        ]);
        $response->header('Cache-Control', 'private, no-store');
        return $response;
    }
}
