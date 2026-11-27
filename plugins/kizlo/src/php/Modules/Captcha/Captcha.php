<?php

namespace Kizlo\Modules\Captcha;

use Kizlo\Modules\Auth\RequestMetadata;
use Kizlo\Modules\Settings\Captcha\CaptchaSettings;
use Throwable;
use WP_Error;

final class Captcha
{
    public static function verify(?string $token): true|WP_Error
    {
        if (!$token || strlen($token) > 16384) return new WP_Error('kizlo_captcha_required', 'A CAPTCHA token is required.', ['status' => 400]);
        $settings = CaptchaSettings::load()->getData();
        $provider = $settings['provider'];
        if ($provider === 'disabled' || $settings['secret'] === '') return self::unavailable();
        if ($provider === 'altcha') return self::altcha($token, $settings['secret']) ? true : self::invalid();
        $endpoint = match ($provider) {
            'recaptcha' => 'https://www.google.com/recaptcha/api/siteverify',
            'turnstile' => 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            'hcaptcha' => 'https://api.hcaptcha.com/siteverify',
            'friendly' => 'https://api.friendlycaptcha.com/api/v1/siteverify',
            'arkose' => 'https://verify-api.arkoselabs.com/api/v4/verify/',
            default => null,
        };
        if ($endpoint === null) return self::unavailable();
        $body = ['secret' => $settings['secret'], 'response' => $token];
        if (RequestMetadata::ip() !== '') $body['remoteip'] = RequestMetadata::ip();
        if ($settings['sitekey'] !== '') $body['sitekey'] = $settings['sitekey'];
        if ($provider === 'friendly') $body = ['secret' => $settings['secret'], 'solution' => $token] + ($settings['sitekey'] !== '' ? ['sitekey' => $settings['sitekey']] : []);
        if ($provider === 'arkose') $body = ['private_key' => $settings['secret'], 'session_token' => $token];
        $response = wp_safe_remote_post($endpoint, ['timeout' => 5, 'redirection' => 0, 'limit_response_size' => 32768,
            'headers' => ['Content-Type' => $provider === 'friendly' ? 'application/json' : 'application/x-www-form-urlencoded'],
            'body' => $provider === 'friendly' ? wp_json_encode($body) : $body]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) return self::unavailable();
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($data)) return self::unavailable();
        $valid = $provider === 'arkose' ? ($data['session_details']['solved'] ?? false) === true : ($data['success'] ?? false) === true;
        if ($provider === 'recaptcha' && isset($data['score'])) $valid = $valid && is_numeric($data['score']) && $data['score'] >= $settings['min_score'];
        return $valid ? true : self::invalid();
    }

    private static function altcha(string $token, string $secret): bool
    {
        try {
            $data = json_decode(base64_decode($token, true) ?: '', true, 8, JSON_THROW_ON_ERROR);
            if (!is_array($data) || !is_string($data['algorithm'] ?? null) || !is_string($data['salt'] ?? null)
                || !is_int($data['number'] ?? null) || $data['number'] < 0 || !is_string($data['challenge'] ?? null)
                || !is_string($data['signature'] ?? null)) return false;
            $algorithm = match (strtoupper($data['algorithm'])) { 'SHA-256' => 'sha256', 'SHA-384' => 'sha384', 'SHA-512' => 'sha512', default => null };
            if ($algorithm === null || !hash_equals(hash($algorithm, $data['salt'] . $data['number']), $data['challenge'])
                || !hash_equals(hash_hmac($algorithm, $data['challenge'], $secret), $data['signature'])) return false;
            parse_str(parse_url($data['salt'], PHP_URL_QUERY) ?: '', $params);
            $expires = filter_var($params['expires'] ?? null, FILTER_VALIDATE_INT);
            if (!$expires || $expires <= time() || $expires > time() + HOUR_IN_SECONDS) return false;
            $key = 'kizlo_altcha_' . hash('sha256', $data['challenge']);
            // add_option is atomic across PHP workers; used proofs cannot be replayed.
            if (!add_option($key, $expires, '', false)) return false;
            wp_schedule_single_event($expires, 'kizlo_captcha_expire', [$key]);
            return true;
        } catch (Throwable $error) {
            return false;
        }
    }

    private static function invalid(): WP_Error
    {
        return new WP_Error('kizlo_captcha_invalid', 'CAPTCHA verification failed.', ['status' => 403]);
    }

    private static function unavailable(): WP_Error
    {
        return new WP_Error('kizlo_captcha_unavailable', 'CAPTCHA verification is unavailable.', ['status' => 503]);
    }
}
