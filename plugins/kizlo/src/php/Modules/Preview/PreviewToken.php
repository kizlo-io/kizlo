<?php

namespace Kizlo\Modules\Preview;

use Kizlo\Support\Utils;
use Throwable;
use WP_Post;

final class PreviewToken
{
    public static function resolve(string $token, WP_Post $original): ?WP_Post
    {
        if ($token === '' || strlen($token) > 4096 || !preg_match('/^[A-Za-z0-9_-]+$/D', $token)) return null;
        try {
            $decoded = base64_decode(strtr($token, '-_', '+/'), true);
            if ($decoded === false) return null;
            $data = json_decode($decoded, true, 8, JSON_THROW_ON_ERROR);
            $payload = $data['payload'] ?? null;
            $hash = $data['hash'] ?? null;
            if (!is_array($payload) || !is_int($payload['id'] ?? null) || !is_int($payload['parent'] ?? null)
                || !is_int($payload['expires'] ?? null) || !is_string($hash)
                || $payload['expires'] <= time() || $payload['parent'] !== $original->ID) return null;
            $secret = Utils::getSettings()->site->getSecret();
            if (!$secret || !hash_equals(hash_hmac('sha256', implode('.', [$payload['id'], $payload['parent'], $payload['expires']]), $secret), $hash)) return null;
            $preview = get_post($payload['id']);
            return $preview instanceof WP_Post && $preview->post_status === 'kizlo_preview'
                && $preview->post_parent === $original->ID && $preview->post_type === $original->post_type ? $preview : null;
        } catch (Throwable $error) {
            return null;
        }
    }
}
