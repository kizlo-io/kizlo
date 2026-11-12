<?php

namespace Kizlo\Pos\Tests\Security;

use Kizlo\Pos\Modules\Security\Security;
use WP_REST_Request;
use WP_UnitTestCase;

final class SecurityTest extends WP_UnitTestCase
{
    private int $user;
    private string $token;
    private array $cookies;

    protected function setUp(): void
    {
        parent::setUp();
        \WC_Install::create_roles();
        wp_roles()->init_roles();
        $this->cookies = $_COOKIE;
        $this->user = self::factory()->user->create(['role' => 'shop_manager', 'user_pass' => 'manager-secret']);
        wp_set_current_user($this->user);
        $this->token = \WP_Session_Tokens::get_instance($this->user)->create(time() + DAY_IN_SECONDS);
        $this->useToken($this->token);
        update_option('home', 'https://pos.example.test');
        global $wp_rest_server;
        $wp_rest_server = null;
        (new Security())->register();
        (new \Kizlo\Pos\Modules\Product\ProductModule())->register();
        rest_get_server();
    }

    protected function tearDown(): void
    {
        $_COOKIE = $this->cookies;
        $_POST = [];
        wp_set_current_user(0);
        parent::tearDown();
    }

    private function useToken(string $token): void
    {
        $_COOKIE[LOGGED_IN_COOKIE] = wp_generate_auth_cookie($this->user, time() + DAY_IN_SECONDS, 'logged_in', $token);
    }

    private function request(string $path = '', array $body = [], string $method = 'POST'): \WP_REST_Response
    {
        $request = new WP_REST_Request($method, '/kizlo-pos/v1/security' . $path);
        $request->set_header('Content-Type', 'application/json');
        $request->set_body(wp_json_encode($body));
        return rest_do_request($request);
    }

    private function configure(): void
    {
        $response = $this->request('/settings', ['password' => 'manager-secret', 'new_pin' => '012345', 'confirm_pin' => '012345', 'idle_minutes' => 15]);
        $this->assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
    }

    public function test_pin_setup_requires_identity_proof_and_stores_only_a_hash(): void
    {
        $this->assertSame(15, Security::status()['idle_minutes']);
        $this->assertFalse(Security::status()['configured']);
        $this->assertTrue(Security::locked());
        foreach (['/kizlo-pos/v1/products', '/kizlo/v1/pos/checkout/config'] as $route) {
            $this->assertSame(428, rest_do_request(new WP_REST_Request('GET', $route))->get_status());
        }
        $this->assertSame(403, $this->request('/settings', ['new_pin' => '012345', 'confirm_pin' => '012345', 'idle_minutes' => 15])->get_status());
        $this->assertSame('', get_user_meta($this->user, Security::PIN, true));
        $this->configure();
        $hash = get_user_meta($this->user, Security::PIN, true);
        $this->assertNotSame('012345', $hash);
        $this->assertTrue(wp_check_password('012345', $hash));
        $this->assertFalse(Security::locked());
        $this->assertSame(400, $this->request('/settings', ['pin' => '012345', 'new_pin' => '123', 'idle_minutes' => 15])->get_status());
        $this->assertSame(400, $this->request('/settings', ['pin' => '012345', 'idle_minutes' => 0])->get_status());
    }

    public function test_lock_blocks_products_and_checkout_and_survives_a_new_page_load(): void
    {
        $this->configure();
        $this->assertSame(200, $this->request('/lock')->get_status());
        $this->assertTrue(Security::status()['locked']);
        $cached = new \WP_REST_Response(['cached' => 'private']);
        $this->assertInstanceOf(\WP_Error::class, (new Security())->guard($cached, rest_get_server(), new WP_REST_Request('GET', '/kizlo-pos/v1/products')));
        foreach (['/kizlo-pos/v1/products', '/kizlo/v1/pos/checkout/config', '/KiZlO-PoS/v1/PrOdUcTs'] as $route) {
            $this->assertSame(423, rest_do_request(new WP_REST_Request('GET', $route))->get_status());
        }
        $this->assertSame(403, $this->request('/unlock', ['password' => 'manager-secret'])->get_status());
        $this->assertSame(200, $this->request('/unlock', ['pin' => '012345'])->get_status());
        $this->assertFalse(Security::locked());
        $this->assertSame(200, rest_do_request(new WP_REST_Request('GET', '/kizlo-pos/v1/products'))->get_status());
    }

    public function test_first_open_is_locked_and_reload_preserves_only_the_remaining_idle_period(): void
    {
        update_user_meta($this->user, Security::PIN, wp_hash_password('012345'));
        $this->assertTrue(Security::status()['locked']);
        $this->assertTrue(\Kizlo\Pos\Support\Asset::bootstrap()['security']['locked']);
        $this->assertSame(200, $this->request('/unlock', ['pin' => '012345'])->get_status());
        $manager = \WP_Session_Tokens::get_instance($this->user);
        $session = $manager->get($this->token);
        $session['kizlo_pos']['active_at'] = time() - 600;
        $manager->update($this->token, $session);
        $reloaded = \Kizlo\Pos\Support\Asset::bootstrap()['security'];
        $this->assertFalse($reloaded['locked']);
        $this->assertGreaterThanOrEqual(299, $reloaded['idle_remaining']);
        $this->assertLessThanOrEqual(300, $reloaded['idle_remaining']);
        $this->assertSame($session['kizlo_pos']['active_at'], $manager->get($this->token)['kizlo_pos']['active_at']);
        $session['kizlo_pos']['active_at'] = time() - 901;
        $manager->update($this->token, $session);
        $this->assertTrue(\Kizlo\Pos\Support\Asset::bootstrap()['security']['locked']);
    }

    public function test_idle_timeout_is_enforced_on_server_and_polling_cannot_revive_it(): void
    {
        $this->configure();
        $manager = \WP_Session_Tokens::get_instance($this->user);
        $session = $manager->get($this->token);
        $session['kizlo_pos']['active_at'] = time() - 901;
        $manager->update($this->token, $session);
        $this->assertTrue(Security::locked());
        $this->assertSame(0, Security::status()['idle_remaining']);
        $this->assertSame(423, $this->request('/activity')->get_status());
        $this->assertTrue(Security::locked());
        $this->assertSame(200, $this->request('/unlock', ['pin' => '012345'])->get_status());
        $this->assertSame(200, $this->request('/settings', ['pin' => '012345', 'idle_minutes' => 1])->get_status());
        $this->assertSame(1, Security::idleMinutes($this->user));
    }

    public function test_lock_is_per_wordpress_session_and_pin_changes_revoke_other_unlocks(): void
    {
        $this->configure();
        $second = \WP_Session_Tokens::get_instance($this->user)->create(time() + DAY_IN_SECONDS);
        $this->useToken($second);
        $this->assertTrue(Security::locked());
        $this->request('/unlock', ['pin' => '012345']);
        $this->request('/settings', ['pin' => '012345', 'new_pin' => '543210', 'confirm_pin' => '543210', 'idle_minutes' => 15]);
        $this->assertFalse(Security::locked());
        $this->useToken($this->token);
        $this->assertTrue(Security::locked());
        $this->assertSame(403, $this->request('/unlock', ['pin' => '012345'])->get_status());
        $this->assertSame(200, $this->request('/unlock', ['pin' => '543210'])->get_status());
    }

    public function test_five_failed_attempts_throttle_even_a_correct_pin_and_non_staff_are_denied(): void
    {
        $this->configure();
        $this->request('/lock');
        for ($i = 0; $i < 5; $i++) $this->assertSame(403, $this->request('/unlock', ['pin' => '999999'])->get_status());
        $this->assertSame(429, $this->request('/unlock', ['pin' => '012345'])->get_status());
        wp_set_current_user(self::factory()->user->create(['role' => 'subscriber']));
        $this->assertSame(403, $this->request('/unlock', ['pin' => '012345'])->get_status());
        wp_set_current_user(0);
        $this->assertSame(401, $this->request('/unlock', ['pin' => '012345'])->get_status());
    }

    public function test_wordpress_profile_settings_validate_password_nonce_and_target_permissions(): void
    {
        $module = new Security();
        $_POST = ['kizlo_pos_security_nonce' => wp_create_nonce('kizlo-pos-profile-' . $this->user),
            'kizlo_pos_pin' => '123456', 'kizlo_pos_confirm' => '123456', 'kizlo_pos_idle' => '20', 'kizlo_pos_password' => 'wrong'];
        $errors = new \WP_Error();
        $module->validateProfile($errors, true, get_userdata($this->user));
        $this->assertTrue($errors->has_errors());
        $this->assertSame('', get_user_meta($this->user, Security::PIN, true));
        $_POST['kizlo_pos_password'] = 'manager-secret';
        $errors = new \WP_Error();
        $module->validateProfile($errors, true, get_userdata($this->user));
        $this->assertFalse($errors->has_errors());
        $module->saveProfile($this->user);
        $this->assertSame(20, Security::idleMinutes($this->user));
        $this->assertTrue(wp_check_password('123456', get_user_meta($this->user, Security::PIN, true)));
        $_POST['kizlo_pos_security_nonce'] = 'invalid';
        $errors = new \WP_Error();
        $module->validateProfile($errors, true, get_userdata($this->user));
        $this->assertTrue($errors->has_errors());
    }

    private function b64(string $bytes): string { return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '='); }

    private function options(string $action, array $body = []): array
    {
        $response = $this->request($action, $body);
        $this->assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        return json_decode(wp_json_encode($response->get_data()), true)['publicKey'];
    }

    private function registerAuthenticator(): array
    {
        $options = $this->options('/passkey/register/options', ['pin' => '012345']);
        $this->assertSame('required', $options['authenticatorSelection']['userVerification']);
        $this->assertSame('platform', $options['authenticatorSelection']['authenticatorAttachment']);
        $private = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        $details = openssl_pkey_get_details($private);
        $id = random_bytes(32);
        $cose = "\xa5\x01\x02\x03\x26\x20\x01\x21\x58\x20" . str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT) . "\x22\x58\x20" . str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT);
        $auth = hash('sha256', 'pos.example.test', true) . "\x45" . pack('N', 0) . str_repeat("\0", 16) . pack('n', strlen($id)) . $id . $cose;
        $attestation = "\xa3\x63fmt\x64none\x68authData\x58" . chr(strlen($auth)) . $auth . "\x67attStmt\xa0";
        $client = wp_json_encode(['type' => 'webauthn.create', 'challenge' => $options['challenge'], 'origin' => 'https://pos.example.test']);
        $response = $this->request('/passkey/register', ['clientDataJSON' => $this->b64($client), 'attestationObject' => $this->b64($attestation)]);
        $this->assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        $this->assertTrue($response->get_data()['has_passkey']);
        return [$private, $this->b64($id)];
    }

    public function test_passkey_registration_and_signed_unlock_verify_origin_uv_signature_and_one_use_challenge(): void
    {
        $this->configure();
        [$private, $id] = $this->registerAuthenticator();
        $this->request('/lock');
        foreach (['wrong-origin', 'wrong-rp', 'wrong-user', 'wrong-challenge', 'expired', 'no-uv', 'bad-signature', 'valid'] as $case) {
            $options = $this->options('/passkey/unlock/options');
            $this->assertSame('required', $options['userVerification']);
            if ($case === 'expired') {
                $manager = \WP_Session_Tokens::get_instance($this->user);
                $session = $manager->get($this->token);
                $session['kizlo_pos_challenge']['expires'] = time() - 1;
                $manager->update($this->token, $session);
            }
            $client = wp_json_encode(['type' => 'webauthn.get', 'challenge' => $case === 'wrong-challenge' ? $this->b64(random_bytes(32)) : $options['challenge'],
                'origin' => $case === 'wrong-origin' ? 'https://other.pos.example.test' : 'https://pos.example.test']);
            $auth = hash('sha256', $case === 'wrong-rp' ? 'other.example.test' : 'pos.example.test', true) . ($case === 'no-uv' ? "\x01" : "\x05") . pack('N', 1);
            openssl_sign($auth . hash('sha256', $client, true), $signature, $private, OPENSSL_ALGO_SHA256);
            $body = ['id' => $id, 'clientDataJSON' => $this->b64($client), 'authenticatorData' => $this->b64($auth),
                'signature' => $this->b64($case === 'bad-signature' ? 'bad' : $signature), 'userHandle' => $this->b64((string) ($this->user + ($case === 'wrong-user' ? 1 : 0)))];
            $response = $this->request('/passkey/unlock', $body);
            $this->assertSame($case === 'valid' ? 200 : 400, $response->get_status(), wp_json_encode($response->get_data()));
            $this->assertSame($case !== 'valid', Security::locked());
            $this->assertSame(400, $this->request('/passkey/unlock', $body)->get_status());
        }
        $this->assertSame(1, array_values(get_user_meta($this->user, Security::KEYS, true))[0]['counter']);
        $this->request('/settings', ['pin' => '012345', 'new_pin' => '333333', 'confirm_pin' => '333333', 'idle_minutes' => 15]);
        $this->assertFalse(Security::status()['has_passkey']);
    }
}
