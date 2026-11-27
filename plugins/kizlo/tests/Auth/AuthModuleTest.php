<?php

namespace Kizlo\Tests\Auth;

use Firebase\JWT\JWT;
use Kizlo\Modules\Auth\AuthModule;
use Kizlo\Modules\Auth\Identity;
use Kizlo\Modules\Auth\RoutePermissions;
use Kizlo\Modules\Settings\Auth\AuthSettings;
use Kizlo\Tests\TestCase;
use WP_Error;
use WP_REST_Request;

final class AuthModuleTest extends TestCase
{
    private string $privateKey = '';

    protected function setUp(): void
    {
        parent::setUp();
        wp_set_current_user(0);
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, $this->privateKey);
        (new AuthSettings())->setData([
            'provider' => 'custom', 'issuer' => 'https://auth.example.com', 'key_source' => 'public_key',
            'public_key' => openssl_pkey_get_details($key)['key'], 'audience' => 'wordpress',
        ])->save();
    }

    public function test_an_absent_token_is_a_guest(): void
    {
        self::assertNull(AuthModule::identity(new WP_REST_Request('GET', '/kizlo/v1/test')));
    }

    public function test_an_unverified_session_is_authenticated_without_becoming_a_wordpress_user(): void
    {
        $identity = AuthModule::identity($this->request(['email' => 'someone@example.com', 'email_verified' => false]));
        self::assertInstanceOf(Identity::class, $identity);
        self::assertFalse($identity->emailVerified);
        self::assertSame(0, get_current_user_id());
    }

    public function test_an_invalid_supplied_token_does_not_become_a_guest_on_public_routes(): void
    {
        $request = new WP_REST_Request('GET', '/kizlo/v1/test');
        $request->set_header('Authorization', 'Bearer invalid.token.signature');
        $result = RoutePermissions::check($request, 'public');
        self::assertInstanceOf(WP_Error::class, $result);
        self::assertSame(401, $result->get_error_data()['status']);
    }

    public function test_expired_tokens_return_401_not_infrastructure_errors(): void
    {
        $result = AuthModule::identity($this->request(['exp' => time() - 120]));
        self::assertInstanceOf(WP_Error::class, $result);
        self::assertSame(401, $result->get_error_data()['status']);
    }

    public function test_a_valid_external_identity_never_grants_administrator_access(): void
    {
        $result = RoutePermissions::check($this->request(), 'admin');
        self::assertInstanceOf(WP_Error::class, $result);
        self::assertSame(401, $result->get_error_data()['status']);
    }

    public function test_a_valid_unverified_session_can_reach_authenticated_operations(): void
    {
        self::assertTrue(RoutePermissions::check($this->request(['email_verified' => false]), 'authenticated'));
    }

    public function test_native_administrator_authentication_is_preserved(): void
    {
        $this->actingAsAdmin();
        self::assertTrue(RoutePermissions::check(new WP_REST_Request('GET', '/kizlo/v1/test'), 'admin'));
    }

    public function test_session_access_requires_an_explicit_permission_check(): void
    {
        $request = new WP_REST_Request('POST', '/kizlo/v1/cart');
        self::assertInstanceOf(WP_Error::class, RoutePermissions::check($request, 'session'));
        $denial = new WP_Error('no_cart', 'Missing cart session.', ['status' => 401]);
        self::assertSame($denial, RoutePermissions::check($request, 'session', static fn() => $denial));
    }

    private function request(array $claims = []): WP_REST_Request
    {
        $request = new WP_REST_Request('GET', '/kizlo/v1/test');
        $token = JWT::encode(array_replace([
            'iss' => 'https://auth.example.com', 'sub' => 'user_123', 'aud' => 'wordpress',
            'email' => 'shopper@example.com', 'email_verified' => true, 'exp' => time() + 60,
        ], $claims), $this->privateKey, 'RS256');
        $request->set_header('Authorization', 'Bearer ' . $token);
        return $request;
    }
}
