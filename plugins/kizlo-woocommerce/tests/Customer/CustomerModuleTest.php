<?php

namespace Kizlo\WooCommerce\Tests\Customer;

use Kizlo\WooCommerce\Modules\Customer\CustomerResolver;
use Kizlo\WooCommerce\Modules\Customer\CustomerModule;
use Kizlo\WooCommerce\Modules\Contract\ContractModule;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Tests\TestCase;
use WP_REST_Request;
use WP_REST_Response;

class CustomerModuleTest extends TestCase
{
    private int $adminId;

    public function setUp(): void
    {
        parent::setUp();
        (new ContractModule())->describe();
        (new CustomerModule())->register();
        $this->bootRestServer();
        $this->adminId = self::factory()->user->create(['role' => 'administrator']);
        wp_set_current_user($this->adminId);
        $GLOBALS['wp_rest_application_password_uuid'] = 'test-application-password';
    }

    public function tearDown(): void
    {
        unset($GLOBALS['wp_rest_application_password_uuid']);
        SessionHandler::clearPreparedIdentity();
        parent::tearDown();
    }

    public function test_customer_first_creation_returns_the_native_payload_without_cart_effects(): void
    {
        $email = 'customer-first@example.com';
        $session = WC()->session;
        $cart = WC()->cart;
        $customer = WC()->customer;
        $response = $this->retrieve($email);

        $this->assertSame(200, $response->get_status());
        $data = $response->get_data();
        $user = get_user_by('email', $email);
        $this->assertSame((int) $user->ID, $data['id']);
        $this->assertSame($email, $data['email']);
        $this->assertContains('customer', $user->roles);
        $this->assertNotEmpty($user->user_pass);
        $this->assertArrayHasKey('additional_fields', $data['billing']);
        $this->assertArrayHasKey('additional_fields', $data['shipping']);
        $this->assertArrayHasKey('additional_fields', $data);
        $this->assertArrayHasKey('kizlo', $data);
        $this->assertSame($this->adminId, get_current_user_id());
        $this->assertSame($session, WC()->session);
        $this->assertSame($cart, WC()->cart);
        $this->assertSame($customer, WC()->customer);
        $this->assertArrayNotHasKey('X-Kizlo-Guest-Token', $response->get_headers());

        $repeated = $this->retrieve($email)->get_data();
        $cartRequest = new WP_REST_Request('GET', '/wc/store/v1/cart');
        $cartRequest->set_header(SessionHandler::HEADER_USER_EMAIL, strtoupper($email));
        $identity = SessionHandler::resolveIdentity($cartRequest, true);
        $this->assertSame($data['id'], $repeated['id']);
        $this->assertSame($data['id'], $identity['user_id']);
        $this->assertCount(1, get_users(['search' => $email, 'search_columns' => ['user_email']]));
    }

    public function test_existing_subscriber_and_saved_details_are_preserved_despite_caller_identity_parameters(): void
    {
        $id = self::factory()->user->create(['role' => 'subscriber', 'user_email' => 'saved@example.com', 'first_name' => 'Saved']);
        update_user_meta($id, 'billing_city', 'London');
        $password = get_userdata($id)->user_pass;
        $request = $this->request('saved@example.com');
        $request->set_query_params(['email' => 'other@example.com', 'id' => $this->adminId, 'context' => 'edit']);
        $data = rest_do_request($request)->get_data();

        $this->assertSame($id, $data['id']);
        $this->assertSame('Saved', $data['first_name']);
        $this->assertSame('London', $data['billing']['city']);
        $this->assertSame($password, get_userdata($id)->user_pass);
        $this->assertSame(['subscriber'], get_userdata($id)->roles);
        $this->assertFalse(get_user_by('email', 'other@example.com'));
    }

    public function test_rejects_missing_invalid_and_privileged_identity(): void
    {
        foreach (['', 'invalid'] as $email) {
            $response = $this->retrieve($email);
            $this->assertSame(401, $response->get_status());
            $this->assertSame('kizlo_invalid_identity', $response->get_data()['code']);
        }
        $response = $this->retrieve(get_userdata($this->adminId)->user_email);
        $this->assertSame(403, $response->get_status());
        $this->assertSame('kizlo_forbidden_identity', $response->get_data()['code']);
    }

    public function test_existing_privileged_identity_filter_is_shared(): void
    {
        $allow = '__return_true';
        add_filter('kizlo_woocommerce_resolvable_cart_user', $allow);
        try {
            $response = $this->retrieve(get_userdata($this->adminId)->user_email);
            $this->assertSame(200, $response->get_status());
            $this->assertSame($this->adminId, $response->get_data()['id']);
        } finally {
            remove_filter('kizlo_woocommerce_resolvable_cart_user', $allow);
        }
    }

    public function test_authentication_rejects_before_provisioning_including_trailing_slash(): void
    {
        $subscriber = self::factory()->user->create(['role' => 'subscriber']);
        foreach ([[0, false, 401], [$this->adminId, false, 401], [$subscriber, true, 403]] as [$id, $appPassword, $status]) {
            wp_set_current_user($id);
            unset($GLOBALS['wp_rest_application_password_uuid']);
            if ($appPassword) $GLOBALS['wp_rest_application_password_uuid'] = 'test-application-password';
            foreach (['', '/'] as $suffix) {
                $email = 'rejected@example.com';
                $response = rest_do_request($this->request($email, $suffix));
                $this->assertSame($suffix === '/' ? 404 : $status, $response->get_status());
                $this->assertFalse(get_user_by('email', $email));
            }
        }
    }

    public function test_contended_lock_prevents_creation_and_retry_succeeds_after_release(): void
    {
        global $wpdb;
        $email = 'contended@example.com';
        $name = 'kizlo_customer_' . substr(hash('sha256', $wpdb->users . ':' . $email), 0, 48);
        $other = new \wpdb(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST);
        $this->assertSame('1', (string) $other->get_var($other->prepare('SELECT GET_LOCK(%s, 0)', $name)));
        try {
            $response = $this->retrieve(strtoupper($email));
            $this->assertSame(503, $response->get_status());
            $this->assertSame('kizlo_customer_unavailable', $response->get_data()['code']);
            $this->assertFalse(get_user_by('email', $email));
        } finally {
            $other->get_var($other->prepare('SELECT RELEASE_LOCK(%s)', $name));
            $other->close();
        }
        $this->assertSame(200, $this->retrieve($email)->get_status());
    }

    public function test_failed_insert_releases_lock_and_can_be_retried(): void
    {
        $fail = static fn(): array => [];
        add_filter('wp_pre_insert_user_data', $fail);
        try {
            $response = $this->retrieve('failed@example.com');
            $this->assertSame(503, $response->get_status());
            $this->assertFalse(get_user_by('email', 'failed@example.com'));
        } finally {
            remove_filter('wp_pre_insert_user_data', $fail);
        }
        global $wpdb;
        $name = 'kizlo_customer_' . substr(hash('sha256', $wpdb->users . ':failed@example.com'), 0, 48);
        $this->assertNull($wpdb->get_var($wpdb->prepare('SELECT IS_USED_LOCK(%s)', $name)));
        $this->assertSame(200, $this->retrieve('failed@example.com')->get_status());
    }

    public function test_insert_failure_reuses_a_customer_created_by_other_code(): void
    {
        $email = 'recovered@example.com';
        $created = null;
        $race = null;
        $race = static function () use (&$race, &$created, $email): array {
            remove_filter('wp_pre_insert_user_data', $race);
            $created = wp_insert_user(['user_login' => 'race-winner', 'user_email' => $email, 'user_pass' => 'race-password', 'role' => 'customer']);
            return [];
        };
        add_filter('wp_pre_insert_user_data', $race);
        try {
            $result = CustomerResolver::resolve($email);
            $this->assertIsInt($created);
            $this->assertSame($created, $result);
        } finally {
            remove_filter('wp_pre_insert_user_data', $race);
        }
    }

    public function test_creates_distinct_random_passwords_and_stores_only_hashes(): void
    {
        $passwords = [];
        $observe = static function (string $password) use (&$passwords): string {
            $passwords[] = $password;
            return $password;
        };
        add_filter('random_password', $observe);
        try {
            $first = CustomerResolver::resolve('password-one@example.com');
            $second = CustomerResolver::resolve('password-two@example.com');
        } finally {
            remove_filter('random_password', $observe);
        }
        $this->assertCount(2, $passwords);
        $this->assertSame(24, strlen($passwords[0]));
        $this->assertNotSame($passwords[0], $passwords[1]);
        foreach ([$first, $second] as $index => $id) {
            $hash = get_userdata($id)->user_pass;
            $this->assertNotSame($passwords[$index], $hash);
            $this->assertTrue(wp_check_password($passwords[$index], $hash, $id));
        }
    }

    public function test_native_customer_search_does_not_create_missing_accounts(): void
    {
        $request = new WP_REST_Request('GET', '/wc/v3/customers');
        $request->set_query_params(['email' => 'search-only@example.com', 'role' => 'all']);
        $response = rest_do_request($request);
        $this->assertSame(200, $response->get_status());
        $this->assertSame([], $response->get_data());
        $this->assertFalse(get_user_by('email', 'search-only@example.com'));
    }

    private function request(string $email, string $suffix = ''): WP_REST_Request
    {
        $request = new WP_REST_Request('GET', '/kizlo/v1/woocommerce/customers' . $suffix);
        if ($email !== '') $request->set_header(SessionHandler::HEADER_USER_EMAIL, $email);
        return $request;
    }

    private function retrieve(string $email): WP_REST_Response
    {
        return rest_do_request($this->request($email));
    }
}
