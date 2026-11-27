<?php

namespace Kizlo\Modules\Auth;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use UnexpectedValueException;

final class JwtVerifier
{
    /** @param array<string, mixed> $config @param Key|array<string, Key> $keys */
    public static function verify(string $token, array $config, Key|array $keys): Identity
    {
        if (strlen($token) > 16384 || substr_count($token, '.') !== 2) throw new UnexpectedValueException('Invalid session token.');
        foreach (is_array($keys) ? $keys : [$keys] as $key) {
            if ($key->getAlgorithm() !== $config['algorithm']) throw new UnexpectedValueException('Unexpected signing algorithm.');
        }
        $previousLeeway = JWT::$leeway;
        try {
            JWT::$leeway = $config['clock_tolerance'];
            $claims = (array) JWT::decode($token, $keys);
        } finally {
            JWT::$leeway = $previousLeeway;
        }
        if (($claims['iss'] ?? null) !== $config['issuer'] || !is_int($claims['exp'] ?? null)) throw new UnexpectedValueException('Invalid issuer or expiration.');
        $subject = self::claim($claims, $config['subject_claim']);
        if (!is_string($subject) || trim($subject) === '') throw new UnexpectedValueException('Missing user identity.');
        if ($config['audience'] !== '') {
            $audience = $claims['aud'] ?? null;
            if (!in_array($config['audience'], is_array($audience) ? $audience : [$audience], true)) throw new UnexpectedValueException('Unexpected audience.');
        }
        if ($config['authorized_parties'] !== [] && !in_array($claims['azp'] ?? null, $config['authorized_parties'], true)) {
            throw new UnexpectedValueException('Unexpected authorized party.');
        }
        if ($config['provider'] === 'clerk' && (!is_string($claims['sid'] ?? null) || $claims['sid'] === '' || ($claims['sts'] ?? null) === 'pending')) {
            throw new UnexpectedValueException('An active Clerk user session is required.');
        }
        if ($config['provider'] === 'kinde') {
            $grants = $claims['gty'] ?? [];
            if (in_array('client_credentials', is_array($grants) ? $grants : [$grants], true)) {
                throw new UnexpectedValueException('A Kinde user access token is required.');
            }
        }
        foreach ($config['required_claims'] as $rule) {
            $value = self::claim($claims, $rule['claim']);
            $matches = match ($rule['operator']) {
                'present' => $value !== null,
                'equals' => $value === $rule['value'],
                'one_of' => in_array($value, $rule['value'], true),
                'contains' => in_array($rule['value'], is_string($value) ? explode(' ', $value) : (is_array($value) ? $value : []), true),
                default => false,
            };
            if (!$matches) throw new UnexpectedValueException('A required session claim is missing or invalid.');
        }
        $email = self::claim($claims, $config['email_claim']);
        $firstName = self::claim($claims, $config['first_name_claim']);
        $lastName = self::claim($claims, $config['last_name_claim']);
        return new Identity(
            $config['issuer'],
            $subject,
            is_string($email) && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null,
            self::claim($claims, $config['email_verified_claim']) === true,
            is_string($firstName) ? $firstName : null,
            is_string($lastName) ? $lastName : null,
        );
    }

    /** @param array<string, mixed> $claims */
    private static function claim(array $claims, string $path): mixed
    {
        $value = $claims;
        foreach (explode('.', $path) as $part) {
            if (is_object($value)) $value = (array) $value;
            if (!is_array($value) || !array_key_exists($part, $value)) return null;
            $value = $value[$part];
        }
        return $value;
    }
}
