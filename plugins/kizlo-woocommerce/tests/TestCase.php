<?php

namespace Kizlo\WooCommerce\Tests;

use WP_REST_Server;
use WP_UnitTestCase;
use WP_REST_Request;
use Firebase\JWT\JWT;
use Kizlo\Modules\Settings\Auth\AuthSettings;

abstract class TestCase extends WP_UnitTestCase
{
    private static string $privateKey = '';
    private static string $publicKey = '';

    /** Locally signed identity; tests exercise the same verifier as browser requests. */
    protected function signRequest(WP_REST_Request $request, string $email, bool $verified = true): void
    {
        if (self::$privateKey === '') {
            $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
            openssl_pkey_export($key, self::$privateKey);
            self::$publicKey = openssl_pkey_get_details($key)['key'];
        }
        (new AuthSettings())->setData([
            'provider' => 'custom', 'issuer' => 'https://test-identity.example.com', 'key_source' => 'public_key',
            'public_key' => self::$publicKey, 'audience' => 'wordpress',
        ])->save();
        $request->set_header('Authorization', 'Bearer ' . JWT::encode([
            'iss' => 'https://test-identity.example.com', 'aud' => 'wordpress', 'sub' => 'test-user',
            'email' => $email, 'email_verified' => $verified, 'exp' => time() + 300,
        ], self::$privateKey, 'RS256'));
    }

    /**
     * Build the REST server and let every plugin register its routes.
     *
     * Route discovery answers nothing until the route table is complete, which
     * it learns from `rest_api_init` finishing. A test that builds the document
     * without this gets an empty contract rather than a failure, so anything
     * asserting on described routes has to boot first.
     */
    protected function bootRestServer(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();

        do_action('rest_api_init', $wp_rest_server);
    }
}
