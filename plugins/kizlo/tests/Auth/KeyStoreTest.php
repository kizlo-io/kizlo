<?php

namespace Kizlo\Tests\Auth;

use Firebase\JWT\JWT;
use Kizlo\Modules\Auth\AuthConfiguration;
use Kizlo\Modules\Auth\JwtVerifier;
use Kizlo\Modules\Auth\KeyStore;
use Kizlo\Modules\Auth\KeyUnavailable;
use Kizlo\Tests\TestCase;
use WP_Error;

final class KeyStoreTest extends TestCase
{
    private array $config;
    private array $jwk;
    private string $privateKey = '';
    private int $fetches = 0;
    private mixed $response;

    protected function setUp(): void
    {
        parent::setUp();
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, $this->privateKey);
        $rsa = openssl_pkey_get_details($key)['rsa'];
        $this->jwk = ['kid' => 'current', 'kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig',
            'n' => JWT::urlsafeB64Encode($rsa['n']), 'e' => JWT::urlsafeB64Encode($rsa['e'])];
        $this->config = AuthConfiguration::normalize(['provider' => 'custom', 'issuer' => 'https://auth.example.com',
            'jwks_url' => 'https://auth.example.com/.well-known/jwks.json']);
        $this->response = $this->document([$this->jwk]);
        add_filter('pre_http_request', [$this, 'fetch'], 10, 3);
        $this->clearCache();
    }

    protected function tearDown(): void
    {
        remove_filter('pre_http_request', [$this, 'fetch']);
        $this->clearCache();
        parent::tearDown();
    }

    public function fetch(mixed $response, array $args, string $url): mixed
    {
        self::assertSame($this->config['jwks_url'], $url);
        self::assertSame(0, $args['redirection']);
        $this->fetches++;
        return $this->response;
    }

    public function test_verified_keys_are_cached_and_cache_eviction_can_recover_without_identity_mapping(): void
    {
        $token = $this->token('current');
        for ($i = 0; $i < 2; $i++) {
            $identity = JwtVerifier::verify($token, $this->config, KeyStore::forToken($token, $this->config));
            self::assertSame('customer@example.com', $identity->email);
        }
        self::assertSame(1, $this->fetches);
        $this->clearCache();
        self::assertTrue(JwtVerifier::verify($token, $this->config, KeyStore::forToken($token, $this->config))->emailVerified);
        self::assertSame(2, $this->fetches);
    }

    public function test_an_unknown_key_refreshes_once_then_recovers_after_rotation(): void
    {
        KeyStore::forToken($this->token('current'), $this->config);
        delete_option($this->cacheKey() . '_refresh');
        $next = array_replace($this->jwk, ['kid' => 'rotated']);
        $this->response = $this->document([$this->jwk, $next]);
        $token = $this->token('rotated');
        self::assertTrue(JwtVerifier::verify($token, $this->config, KeyStore::forToken($token, $this->config))->emailVerified);
        self::assertSame(2, $this->fetches);
        for ($i = 0; $i < 3; $i++) {
            try {
                KeyStore::forToken($this->token('missing-' . $i), $this->config);
                self::fail('An unknown key must not authorize a request.');
            } catch (KeyUnavailable $error) {
                self::assertSame(2, $this->fetches);
            }
        }
    }

    public function test_a_held_refresh_guard_blocks_cold_requests_and_an_expired_guard_recovers(): void
    {
        add_option($this->cacheKey() . '_refresh', (string) (time() + 30), '', false);
        try {
            KeyStore::forToken($this->token('current'), $this->config);
            self::fail('A concurrent refresh must not start another provider request.');
        } catch (KeyUnavailable $error) {
            self::assertSame(0, $this->fetches);
        }
        update_option($this->cacheKey() . '_refresh', (string) (time() - 1));
        KeyStore::forToken($this->token('current'), $this->config);
        self::assertSame(1, $this->fetches);
    }

    /** @dataProvider unavailableResponses */
    public function test_unavailable_or_malformed_key_infrastructure_fails_closed(mixed $response): void
    {
        $this->response = $response;
        $this->expectException(KeyUnavailable::class);
        KeyStore::forToken($this->token('current'), $this->config);
    }

    public function unavailableResponses(): array
    {
        return [
            'network' => [new WP_Error('http_request_failed', 'Unavailable')],
            'server' => [['response' => ['code' => 503], 'body' => '{}']],
            'invalid-json' => [['response' => ['code' => 200], 'body' => '{']],
            'no-keys' => [['response' => ['code' => 200], 'body' => '{}']],
            'oversized-keyset' => [['response' => ['code' => 200], 'body' => json_encode(['keys' => array_fill(0, 33, [])])]],
        ];
    }

    private function token(string $kid): string
    {
        return JWT::encode(['iss' => 'https://auth.example.com', 'sub' => 'user', 'exp' => time() + 60,
            'email' => 'customer@example.com', 'email_verified' => true], $this->privateKey, 'RS256', $kid);
    }

    private function document(array $keys): array
    {
        return ['response' => ['code' => 200], 'body' => json_encode(['keys' => $keys])];
    }

    private function cacheKey(): string
    {
        return 'kizlo_jwks_' . hash('sha256', $this->config['jwks_url'] . ':' . $this->config['algorithm']);
    }

    private function clearCache(): void
    {
        delete_transient($this->cacheKey());
        delete_option($this->cacheKey() . '_refresh');
    }
}
