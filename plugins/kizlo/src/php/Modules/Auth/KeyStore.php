<?php

namespace Kizlo\Modules\Auth;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use UnexpectedValueException;
use Throwable;

final class KeyStore
{
    /** @param array<string, mixed> $config */
    public static function forToken(string $token, array $config): Key
    {
        if (strlen($token) > 16384 || substr_count($token, '.') !== 2) throw new UnexpectedValueException('Invalid session token.');
        $header = json_decode(JWT::urlsafeB64Decode(explode('.', $token)[0]), true, 8, JSON_THROW_ON_ERROR);
        if (!is_array($header) || ($header['alg'] ?? null) !== $config['algorithm']) throw new UnexpectedValueException('Unexpected signing algorithm.');
        if ($config['key_source'] === 'public_key') return new Key($config['public_key'], $config['algorithm']);

        $kid = $header['kid'] ?? null;
        if (!is_string($kid) || $kid === '' || strlen($kid) > 128) throw new UnexpectedValueException('Missing signing key identifier.');
        $cacheKey = 'kizlo_jwks_' . hash('sha256', $config['jwks_url'] . ':' . $config['algorithm']);
        $document = get_transient($cacheKey);
        $key = is_array($document) ? self::find($document, $kid, $config['algorithm']) : null;
        if ($key !== null) return $key;

        // Unknown key IDs cannot turn arbitrary token traffic into unbounded provider requests.
        if (!self::beginRefresh($cacheKey)) throw new KeyUnavailable('Signing key is unavailable. Retry shortly.');
        $response = wp_safe_remote_get($config['jwks_url'], [
            'timeout' => 5,
            'redirection' => 0,
            'limit_response_size' => 131072,
            'headers' => ['Accept' => 'application/json'],
        ]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) throw new KeyUnavailable('Signing keys are unavailable.');
        try {
            $document = json_decode(wp_remote_retrieve_body($response), true, 16, JSON_THROW_ON_ERROR);
        } catch (Throwable $error) {
            throw new KeyUnavailable('Invalid signing key response.', 0, $error);
        }
        if (!is_array($document) || !is_array($document['keys'] ?? null) || count($document['keys']) > 32) throw new KeyUnavailable('Invalid signing key response.');
        $key = self::find($document, $kid, $config['algorithm']);
        set_transient($cacheKey, $document, HOUR_IN_SECONDS);
        if ($key === null) throw new UnexpectedValueException('Unknown signing key.');
        return $key;
    }

    private static function beginRefresh(string $cacheKey): bool
    {
        global $wpdb;
        $name = $cacheKey . '_refresh';
        $now = time();
        // One database write wins, including when several workers observe an expired guard.
        $changed = $wpdb->query($wpdb->prepare(
            "INSERT INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'no') "
            . 'ON DUPLICATE KEY UPDATE option_value = IF(CAST(option_value AS UNSIGNED) <= %d, VALUES(option_value), option_value)',
            $name, (string) ($now + 30), $now,
        ));
        if (!$changed) return false;
        wp_cache_delete($name, 'options');
        wp_cache_delete('notoptions', 'options');
        return true;
    }

    /** @param array<string, mixed> $document */
    private static function find(array $document, string $kid, string $algorithm): ?Key
    {
        foreach ($document['keys'] ?? [] as $jwk) {
            if (!is_array($jwk) || ($jwk['kid'] ?? null) !== $kid || ($jwk['alg'] ?? $algorithm) !== $algorithm
                || ($jwk['use'] ?? 'sig') !== 'sig' || (isset($jwk['key_ops']) && !in_array('verify', (array) $jwk['key_ops'], true))) continue;
            try {
                $key = JWK::parseKey($jwk, $algorithm);
            } catch (Throwable $error) {
                throw new KeyUnavailable('Invalid configured signing key.', 0, $error);
            }
            if ($key !== null && $key->getAlgorithm() === $algorithm) return $key;
        }
        return null;
    }
}
