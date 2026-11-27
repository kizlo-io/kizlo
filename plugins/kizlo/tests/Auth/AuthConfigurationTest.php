<?php

namespace Kizlo\Tests\Auth;

use InvalidArgumentException;
use Kizlo\Modules\Auth\AuthConfiguration;
use PHPUnit\Framework\TestCase;

final class AuthConfigurationTest extends TestCase
{
    public function test_authentication_is_disabled_until_configured(): void
    {
        self::assertSame('disabled', AuthConfiguration::normalize([])['provider']);
    }

    public function test_presets_derive_keys_from_the_configured_issuer(): void
    {
        $clerk = AuthConfiguration::normalize(['provider' => 'clerk', 'issuer' => 'https://tenant.clerk.accounts.dev', 'authorized_parties' => ['http://localhost:3000']]);
        self::assertSame('https://tenant.clerk.accounts.dev/.well-known/jwks.json', $clerk['jwks_url']);
        $kinde = AuthConfiguration::normalize(['provider' => 'kinde', 'issuer' => 'https://tenant.kinde.com', 'audience' => 'wordpress']);
        self::assertSame('https://tenant.kinde.com/.well-known/jwks', $kinde['jwks_url']);
    }

    /** @dataProvider invalidSettings */
    public function test_invalid_settings_are_rejected(array $settings): void
    {
        $this->expectException(InvalidArgumentException::class);
        AuthConfiguration::normalize($settings);
    }

    public static function invalidSettings(): array
    {
        return [
            'unknown provider' => [['provider' => 'other']],
            'verification bypass' => [['verify_signature' => false]],
            'unsupported algorithm' => [['algorithm' => 'none']],
            'symmetric key confusion' => [['algorithm' => 'HS256']],
            'large clock tolerance' => [['clock_tolerance' => 999999]],
            'fractional clock tolerance' => [['clock_tolerance' => 1.5]],
            'invalid subject path' => [['subject_claim' => 'sub..id']],
            'wildcard origin' => [['allowed_origins' => ['*']]],
            'origin path' => [['allowed_origins' => ['https://store.example.com/path']]],
            'origin credentials' => [['allowed_origins' => ['https://user:pass@store.example.com']]],
            'insecure remote origin' => [['allowed_origins' => ['http://store.example.com']]],
            'plain HTTP issuer' => [['provider' => 'clerk', 'issuer' => 'http://auth.example.com']],
            'issuer with credentials' => [['provider' => 'clerk', 'issuer' => 'https://user:pass@auth.example.com']],
            'missing clerk authorized parties' => [['provider' => 'clerk', 'issuer' => 'https://auth.example.com']],
            'missing kinde audience' => [['provider' => 'kinde', 'issuer' => 'https://tenant.kinde.com']],
            'invalid rule operator' => [['required_claims' => [['claim' => 'role', 'operator' => 'execute']]]],
            'missing rule value' => [['required_claims' => [['claim' => 'role', 'operator' => 'equals']]]],
            'invalid rule list' => [['required_claims' => [['claim' => 'role', 'operator' => 'one_of', 'value' => 'admin']]]],
        ];
    }
}
