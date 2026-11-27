<?php

namespace Kizlo\Tests\Auth;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Kizlo\Modules\Auth\AuthConfiguration;
use Kizlo\Modules\Auth\JwtVerifier;
use PHPUnit\Framework\TestCase;
use UnexpectedValueException;

final class JwtVerifierTest extends TestCase
{
    private static string $privateKey = '';
    private static string $publicKey;

    public static function setUpBeforeClass(): void
    {
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, self::$privateKey);
        self::$publicKey = openssl_pkey_get_details($key)['key'];
    }

    public function test_verified_claims_are_read_from_the_signed_token(): void
    {
        $identity = $this->verify(['email' => 'shopper@example.com', 'email_verified' => true]);
        self::assertSame('user_123', $identity->subject);
        self::assertSame('shopper@example.com', $identity->email);
        self::assertTrue($identity->emailVerified);
    }

    public function test_unverified_users_are_still_authenticated(): void
    {
        $identity = $this->verify(['email' => 'shopper@example.com', 'email_verified' => false]);
        self::assertSame('user_123', $identity->subject);
        self::assertFalse($identity->emailVerified);
    }

    public function test_string_true_is_not_proof_of_email_verification(): void
    {
        self::assertFalse($this->verify(['email_verified' => 'true'])->emailVerified);
    }

    public function test_missing_email_does_not_invalidate_the_provider_session(): void
    {
        self::assertNull($this->verify([])->email);
    }

    public function test_nested_claim_paths_are_supported(): void
    {
        $identity = $this->verify(['profile' => ['email' => 'shopper@example.com', 'verified' => true]], [
            'email_claim' => 'profile.email', 'email_verified_claim' => 'profile.verified',
        ]);
        self::assertSame('shopper@example.com', $identity->email);
        self::assertTrue($identity->emailVerified);
    }

    /** @dataProvider invalidClaims */
    public function test_invalid_claims_cannot_authenticate(array $claims): void
    {
        $this->expectException(UnexpectedValueException::class);
        $this->verify($claims);
    }

    public static function invalidClaims(): array
    {
        return [
            'issuer' => [['iss' => 'https://attacker.example.com']],
            'expired' => [['exp' => time() - 120]],
            'no expiration' => [['exp' => null]],
            'not yet valid' => [['nbf' => time() + 120]],
            'audience' => [['aud' => 'another-api']],
            'no subject' => [['sub' => '']],
            'object subject' => [['sub' => ['id' => 'user_123']]],
        ];
    }

    public function test_custom_es256_tokens_use_the_configured_p256_key(): void
    {
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        openssl_pkey_export($key, $private);
        $public = openssl_pkey_get_details($key)['key'];
        $config = $this->configuration(['algorithm' => 'ES256', 'public_key' => $public]);
        $identity = JwtVerifier::verify(JWT::encode($this->claims(), $private, 'ES256'), $config, new Key($public, 'ES256'));
        self::assertSame('user_123', $identity->subject);
    }

    public function test_algorithm_is_pinned_to_the_configuration(): void
    {
        $this->expectException(UnexpectedValueException::class);
        $token = JWT::encode($this->claims(), str_repeat('a', 64), 'HS256');
        JwtVerifier::verify($token, $this->configuration(), new Key(self::$publicKey, 'RS256'));
    }

    public function test_tampering_with_the_email_breaks_the_signature(): void
    {
        $this->expectException(UnexpectedValueException::class);
        $parts = explode('.', JWT::encode($this->claims(), self::$privateKey, 'RS256'));
        $parts[1] = JWT::urlsafeB64Encode(json_encode($this->claims(['email' => 'victim@example.com'])));
        JwtVerifier::verify(implode('.', $parts), $this->configuration(), new Key(self::$publicKey, 'RS256'));
    }

    public function test_additional_rules_use_strict_values_and_space_delimited_scopes(): void
    {
        $this->expectException(UnexpectedValueException::class);
        $this->verify(['scope' => 'openid profile', 'active' => 'true'], ['required_claims' => [
            ['claim' => 'scope', 'operator' => 'contains', 'value' => 'profile'],
            ['claim' => 'active', 'operator' => 'equals', 'value' => true],
        ]]);
    }

    public function test_clerk_requires_a_session_and_checks_its_authorized_party(): void
    {
        $this->expectException(UnexpectedValueException::class);
        $this->verify(['sid' => 'sess_123', 'azp' => 'https://attacker.example.com'], [
            'provider' => 'clerk', 'authorized_parties' => ['https://store.example.com'],
        ]);
    }

    public function test_pending_clerk_sessions_are_rejected(): void
    {
        $this->expectException(UnexpectedValueException::class);
        $this->verify(['sid' => 'sess_123', 'azp' => 'https://store.example.com', 'sts' => 'pending'], [
            'provider' => 'clerk', 'authorized_parties' => ['https://store.example.com'],
        ]);
    }

    public function test_kinde_user_access_tokens_retain_unverified_guest_identity(): void
    {
        $identity = $this->verify(['email' => 'shopper@example.com', 'email_verified' => false, 'gty' => ['authorization_code']], ['provider' => 'kinde']);
        self::assertSame('user_123', $identity->subject);
        self::assertFalse($identity->emailVerified);
    }

    public function test_kinde_machine_tokens_cannot_select_a_customer_even_with_user_like_claims(): void
    {
        $this->expectException(UnexpectedValueException::class);
        $this->verify(['gty' => ['client_credentials'], 'email' => 'shopper@example.com', 'email_verified' => true], ['provider' => 'kinde']);
    }

    public function test_audience_may_be_an_array(): void
    {
        self::assertSame('user_123', $this->verify(['aud' => ['other-api', 'wordpress']])->subject);
    }

    public function test_verification_restores_global_library_tolerance_after_failure(): void
    {
        $original = JWT::$leeway;
        JWT::$leeway = 17;
        try {
            try { $this->verify(['exp' => time() - 120]); } catch (UnexpectedValueException $error) {}
            self::assertSame(17, JWT::$leeway);
        } finally { JWT::$leeway = $original; }
    }

    private function verify(array $claims, array $options = []): \Kizlo\Modules\Auth\Identity
    {
        return JwtVerifier::verify(JWT::encode($this->claims($claims), self::$privateKey, 'RS256'), $this->configuration($options), new Key(self::$publicKey, 'RS256'));
    }

    private function configuration(array $options = []): array
    {
        return AuthConfiguration::normalize(array_replace([
            'provider' => 'custom', 'issuer' => 'https://auth.example.com', 'key_source' => 'public_key',
            'public_key' => self::$publicKey, 'audience' => 'wordpress',
        ], $options));
    }

    private function claims(array $claims = []): array
    {
        return array_replace(['iss' => 'https://auth.example.com', 'sub' => 'user_123', 'aud' => 'wordpress', 'iat' => time(), 'nbf' => time() - 1, 'exp' => time() + 60], $claims);
    }
}
