<?php

namespace Kizlo\Modules\Integrations;

use WP_Error;

/** Secrets stay outside the general settings response and cache. */
final class WhatsAppSettings
{
    public const OPTION = 'kizlo_integration_whatsapp';

    public static function status(): array
    {
        $saved = (array) get_option(self::OPTION, []);
        $phone = (string) ($saved['phone_number_id'] ?? '');
        $token = !empty($saved['token']);
        return ['phone_number_id' => $phone, 'token_set' => $token, 'configured' => $phone !== '' && $token];
    }

    public static function save(array $input): array|WP_Error
    {
        if (array_diff(array_keys($input), ['phone_number_id', 'api_token', 'clear_token'])) return new WP_Error('kizlo_whatsapp_invalid', 'Unknown WhatsApp setting.', ['status' => 400]);
        $saved = (array) get_option(self::OPTION, []);
        $phone = $input['phone_number_id'] ?? ($saved['phone_number_id'] ?? '');
        $token = $input['api_token'] ?? '';
        $clear = $input['clear_token'] ?? false;
        if (!is_string($phone) || ($phone !== '' && !preg_match('/^[1-9][0-9]{4,24}$/D', $phone))) return new WP_Error('kizlo_whatsapp_invalid', 'Enter the phone number ID from Meta, not the phone number.', ['status' => 400]);
        if (!is_string($token) || strlen($token) > 8192 || ($token !== '' && !preg_match('/^[\x21-\x7e]+$/D', $token)) || !is_bool($clear) || ($clear && $token !== '')) return new WP_Error('kizlo_whatsapp_invalid', 'Enter a valid API token or choose to remove the saved token.', ['status' => 400]);
        $saved['phone_number_id'] = $phone;
        if ($clear) unset($saved['token']);
        if ($token !== '') {
            if (!function_exists('openssl_encrypt')) return new WP_Error('kizlo_whatsapp_unavailable', 'OpenSSL is required to store WhatsApp credentials.', ['status' => 503]);
            $iv = random_bytes(12);
            $tag = '';
            $encrypted = openssl_encrypt($token, 'aes-256-gcm', hash('sha256', wp_salt('auth'), true), OPENSSL_RAW_DATA, $iv, $tag);
            if ($encrypted === false) return new WP_Error('kizlo_whatsapp_unavailable', 'Unable to protect the WhatsApp token.', ['status' => 503]);
            $saved['token'] = base64_encode($iv . $tag . $encrypted);
        }
        update_option(self::OPTION, $saved, false);
        return self::status();
    }

    public static function token(): string|WP_Error
    {
        $saved = (array) get_option(self::OPTION, []);
        $value = base64_decode((string) ($saved['token'] ?? ''), true);
        if (!function_exists('openssl_decrypt') || $value === false || strlen($value) < 29) return new WP_Error('kizlo_whatsapp_credentials', 'Save a WhatsApp API token in Kizlo → Integrations → WhatsApp.', ['status' => 503]);
        $token = openssl_decrypt(substr($value, 28), 'aes-256-gcm', hash('sha256', wp_salt('auth'), true), OPENSSL_RAW_DATA, substr($value, 0, 12), substr($value, 12, 16));
        return is_string($token) && $token !== '' ? $token : new WP_Error('kizlo_whatsapp_credentials', 'Re-enter the WhatsApp API token. The site encryption key may have changed.', ['status' => 503]);
    }
}
