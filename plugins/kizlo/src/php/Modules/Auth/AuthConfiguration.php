<?php

namespace Kizlo\Modules\Auth;

use InvalidArgumentException;

final class AuthConfiguration
{
    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'provider' => 'disabled',
            'issuer' => '',
            'key_source' => 'jwks',
            'jwks_url' => '',
            'public_key' => '',
            'algorithm' => 'RS256',
            'audience' => '',
            'authorized_parties' => [],
            'allowed_origins' => [],
            'clock_tolerance' => 5,
            'subject_claim' => 'sub',
            'email_claim' => 'email',
            'email_verified_claim' => 'email_verified',
            'first_name_claim' => 'given_name',
            'last_name_claim' => 'family_name',
            'required_claims' => [],
        ];
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public static function normalize(array $input): array
    {
        $config = self::defaults();
        foreach ($input as $key => $value) {
            if (!array_key_exists($key, $config)) throw new InvalidArgumentException("Unknown authentication setting: {$key}.");
            if (is_string($config[$key])) {
                if (!is_string($value)) throw new InvalidArgumentException("{$key} must be a string.");
                $config[$key] = trim($value);
            } else {
                $config[$key] = $value;
            }
        }
        if (!in_array($config['provider'], ['disabled', 'clerk', 'kinde', 'custom'], true)) {
            throw new InvalidArgumentException('Choose a supported authentication provider.');
        }
        if (!in_array($config['key_source'], ['jwks', 'public_key'], true)) throw new InvalidArgumentException('Choose JWKS or a public key.');
        if (!in_array($config['algorithm'], ['RS256', 'ES256'], true)) throw new InvalidArgumentException('Choose RS256 or ES256.');
        if (!is_int($config['clock_tolerance']) || $config['clock_tolerance'] < 0 || $config['clock_tolerance'] > 60) {
            throw new InvalidArgumentException('Clock tolerance must be between 0 and 60 seconds.');
        }
        foreach (['subject_claim', 'email_claim', 'email_verified_claim', 'first_name_claim', 'last_name_claim'] as $key) {
            if (!self::isClaimPath($config[$key])) throw new InvalidArgumentException("{$key} must be a dotted claim path.");
        }
        foreach (['allowed_origins', 'authorized_parties'] as $key) {
            if (!is_array($config[$key]) || !array_is_list($config[$key])) throw new InvalidArgumentException("{$key} must be a list of origins.");
            foreach ($config[$key] as $origin) self::assertOrigin($origin);
            $config[$key] = array_values(array_unique($config[$key]));
        }
        if (!is_array($config['required_claims']) || !array_is_list($config['required_claims']) || count($config['required_claims']) > 20) {
            throw new InvalidArgumentException('Configure at most 20 required claims.');
        }
        foreach ($config['required_claims'] as $rule) {
            if (!is_array($rule) || !self::isClaimPath($rule['claim'] ?? null)
                || !in_array($rule['operator'] ?? null, ['present', 'equals', 'one_of', 'contains'], true)) {
                throw new InvalidArgumentException('Each claim rule needs a claim path and a supported operator.');
            }
            if ($rule['operator'] !== 'present' && !array_key_exists('value', $rule)) throw new InvalidArgumentException('The claim rule needs a value.');
            if ($rule['operator'] === 'equals' && !is_scalar($rule['value']) && $rule['value'] !== null) throw new InvalidArgumentException('Claim equality requires a scalar value.');
            if ($rule['operator'] === 'one_of' && (!is_array($rule['value']) || !array_is_list($rule['value']) || $rule['value'] === [])) {
                throw new InvalidArgumentException('one_of requires a nonempty list.');
            }
            if ($rule['operator'] === 'contains' && !is_string($rule['value'])) throw new InvalidArgumentException('contains requires a scope string.');
        }
        if ($config['provider'] === 'disabled') return $config;
        self::assertHttpsUrl($config['issuer']);
        if ($config['provider'] !== 'custom') {
            $config['algorithm'] = 'RS256';
            $config['key_source'] = 'jwks';
            $config['public_key'] = '';
            $config['required_claims'] = [];
            $config['jwks_url'] = rtrim($config['issuer'], '/') . ($config['provider'] === 'clerk' ? '/.well-known/jwks.json' : '/.well-known/jwks');
            $config['subject_claim'] = 'sub';
            if ($config['provider'] === 'clerk') $config['audience'] = '';
            if ($config['provider'] === 'kinde') $config['authorized_parties'] = [];
        }
        if ($config['provider'] === 'kinde' && $config['audience'] === '') throw new InvalidArgumentException('Kinde requires the WordPress API audience.');
        if ($config['provider'] === 'clerk' && $config['authorized_parties'] === []) throw new InvalidArgumentException('Configure the frontend origins allowed to obtain Clerk tokens.');
        if ($config['key_source'] === 'jwks') {
            self::assertHttpsUrl($config['jwks_url']);
        } else {
            $key = openssl_pkey_get_public($config['public_key']);
            if ($key === false) throw new InvalidArgumentException('Enter a valid PEM public key.');
            $details = openssl_pkey_get_details($key);
            if ($details === false || ($config['algorithm'] === 'RS256' && ($details['type'] !== OPENSSL_KEYTYPE_RSA || $details['bits'] < 2048))
                || ($config['algorithm'] === 'ES256' && ($details['type'] !== OPENSSL_KEYTYPE_EC || ($details['ec']['curve_name'] ?? '') !== 'prime256v1'))) {
                throw new InvalidArgumentException('The public key must match the configured algorithm (RSA 2048+ or P-256).');
            }
        }
        return $config;
    }

    public static function isClaimPath(mixed $path): bool
    {
        return is_string($path) && preg_match('/^[a-zA-Z_][a-zA-Z0-9_-]*(\.[a-zA-Z_][a-zA-Z0-9_-]*)*$/D', $path) === 1;
    }

    public static function assertHttpsUrl(mixed $url): void
    {
        if (!is_string($url) || !filter_var($url, FILTER_VALIDATE_URL) || parse_url($url, PHP_URL_SCHEME) !== 'https'
            || parse_url($url, PHP_URL_USER) !== null || parse_url($url, PHP_URL_PASS) !== null
            || parse_url($url, PHP_URL_FRAGMENT) !== null || parse_url($url, PHP_URL_QUERY) !== null) {
            throw new InvalidArgumentException('Use an HTTPS URL without credentials, a query, or a fragment.');
        }
    }

    private static function assertOrigin(mixed $origin): void
    {
        if (!is_string($origin) || !filter_var($origin, FILTER_VALIDATE_URL)) throw new InvalidArgumentException('Enter a valid frontend origin.');
        $parts = parse_url($origin);
        $local = in_array($parts['host'] ?? '', ['localhost', '127.0.0.1', '[::1]'], true);
        if (!is_array($parts) || (($parts['scheme'] ?? '') !== 'https' && !($local && ($parts['scheme'] ?? '') === 'http'))
            || isset($parts['user'], $parts['pass']) || isset($parts['user']) || isset($parts['query']) || isset($parts['fragment'])
            || ($parts['path'] ?? '') !== '') throw new InvalidArgumentException('Use an exact HTTPS origin, or HTTP localhost, without a path.');
    }
}
