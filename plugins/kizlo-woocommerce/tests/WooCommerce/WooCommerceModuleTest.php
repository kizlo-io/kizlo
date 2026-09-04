<?php

namespace Kizlo\WooCommerce\Tests\WooCommerce;

use Kizlo\Modules\RestApi\RestGuard;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

class WooCommerceModuleTest extends TestCase
{
    private const GUEST_TOKEN = 't_0123456789abcdef0123456789abcd';

    private WP_REST_Server $server;
    private int $adminId;
    private int $customerId;
    private string $customerEmail;
    private ?int $permissionUser = null;
    private RestGuard $guard;
    private WooCommerceModule $module;

    public function setUp(): void
    {
        parent::setUp();

        $this->adminId       = self::factory()->user->create(['role' => 'administrator']);
        $this->customerId    = self::factory()->user->create([
            'role'       => 'subscriber',
            'user_email' => 'customer@example.com',
            'user_login' => 'headless-customer',
        ]);
        $this->customerEmail = (string) get_userdata($this->customerId)->user_email;
        $this->guard         = new RestGuard();
        $this->module        = new WooCommerceModule();

        add_filter('rest_request_before_callbacks', [$this->guard, 'requireAdmin'], 0, 3);
        add_filter('kizlo_rest_route_requires_admin', [$this->module, 'requiresKizloAdmin'], 10, 2);
        add_filter('woocommerce_session_handler', [$this->module, 'maybeUseHeadlessSession']);
        add_filter('woocommerce_store_api_disable_nonce_check', [$this->module, 'maybeDisableNonceCheck']);
        add_filter('rest_request_before_callbacks', [$this->module, 'maybeSwitchStoreApiUser'], 10, 3);

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        add_action('rest_api_init', [$this, 'registerTestRoutes']);
        do_action('rest_api_init', $this->server);
        remove_action('rest_api_init', [$this, 'registerTestRoutes']);
    }

    public function tearDown(): void
    {
        $this->resetWooCommerce();

        remove_filter('rest_request_before_callbacks', [$this->guard, 'requireAdmin'], 0);
        remove_filter('kizlo_rest_route_requires_admin', [$this->module, 'requiresKizloAdmin'], 10);
        remove_filter('woocommerce_session_handler', [$this->module, 'maybeUseHeadlessSession']);
        remove_filter('woocommerce_store_api_disable_nonce_check', [$this->module, 'maybeDisableNonceCheck']);
        remove_filter('rest_request_before_callbacks', [$this->module, 'maybeSwitchStoreApiUser'], 10);
        SessionHandler::clearPreparedIdentity();

        parent::tearDown();
    }

    public function registerTestRoutes(): void
    {
        foreach (['/cart/kizlo-auth-test', '/kizlo-public-test'] as $route) {
            register_rest_route('wc/store/v1', $route, [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => function (): bool {
                    $this->permissionUser = get_current_user_id();
                    return true;
                },
                'callback'            => static fn(): WP_REST_Response => new WP_REST_Response([
                    'user_id' => get_current_user_id(),
                ]),
            ]);
        }
    }

    public function test_route_policy_protects_only_identity_sensitive_woocommerce_families(): void
    {
        foreach ([
            '/wc/store/v1/cart',
            '/wc/store/v1/cart/items',
            '/wc/store/v1/checkout',
            '/wc/store/v1/order/12',
            '/wc/v3/customers',
            '/wc/v3/orders/12',
        ] as $route) {
            $this->assertTrue($this->module->requiresKizloAdmin(true, new WP_REST_Request('GET', $route)), $route);
        }

        foreach (['/wc/store/v1/products', '/wc/store/v1/product-collection-data', '/wc/v3/products'] as $route) {
            $this->assertFalse($this->module->requiresKizloAdmin(true, new WP_REST_Request('GET', $route)), $route);
        }

        $this->assertTrue($this->module->requiresKizloAdmin(true, new WP_REST_Request('GET', '/kizlo/v1/introspect')));
    }

    public function test_store_api_permissions_and_callback_see_the_resolved_customer_once(): void
    {
        $request = $this->request('/wc/store/v1/cart/kizlo-auth-test', [
            SessionHandler::HEADER_USER_EMAIL => $this->customerEmail,
        ]);
        $this->authenticateAs($this->adminId, true);

        $first = $this->server->dispatch($request);
        $session = WC()->session;
        $this->module->maybeSwitchStoreApiUser(null, null, $request);

        $this->assertSame($this->customerId, $this->permissionUser);
        $this->assertSame($this->customerId, $first->get_data()['user_id']);
        $this->assertSame($session, WC()->session);
        $this->assertTrue(apply_filters('woocommerce_store_api_disable_nonce_check', false));
    }

    public function test_guest_cart_merges_during_the_original_cart_request(): void
    {
        global $wpdb;

        $product = new \WC_Product_Simple();
        $product->set_name('Original request merge');
        $product->set_regular_price('10');
        $product->set_status('publish');
        $product->save();

        $cartKey = md5((string) $product->get_id());
        $wpdb->replace(
            $wpdb->prefix . 'woocommerce_sessions',
            [
                'session_key'    => self::GUEST_TOKEN,
                'session_value'  => maybe_serialize([
                    'cart' => maybe_serialize([
                        $cartKey => [
                            'key'          => $cartKey,
                            'product_id'   => $product->get_id(),
                            'variation_id' => 0,
                            'variation'    => [],
                            'quantity'     => 1,
                        ],
                    ]),
                ]),
                'session_expiry' => time() + SessionHandler::SESSION_LIFETIME,
            ],
            ['%s', '%s', '%d']
        );

        $request = $this->request('/wc/store/v1/cart/kizlo-auth-test', [
            SessionHandler::HEADER_USER_EMAIL  => $this->customerEmail,
            SessionHandler::HEADER_GUEST_TOKEN => self::GUEST_TOKEN,
        ]);
        $this->authenticateAs($this->adminId, true);

        $response = $this->server->dispatch($request);
        $this->module->maybeSwitchStoreApiUser(null, null, $request);

        $this->assertSame(200, $response->get_status());
        $this->assertSame($this->customerId, $response->get_data()['user_id']);
        $this->assertSame(1, WC()->cart->get_cart_contents_count());
        $this->assertNull($wpdb->get_var($wpdb->prepare(
            'SELECT session_key FROM %i WHERE session_key = %s',
            $wpdb->prefix . 'woocommerce_sessions',
            self::GUEST_TOKEN
        )));
    }

    public function test_public_catalog_routes_ignore_identity_headers_and_do_not_initialize_a_session(): void
    {
        $response = $this->dispatch('/wc/store/v1/kizlo-public-test', 0, false, [
            SessionHandler::HEADER_USER_EMAIL => $this->customerEmail,
        ]);

        $this->assertSame(200, $response->get_status());
        $this->assertSame(0, $this->permissionUser);
        $this->assertSame(0, $response->get_data()['user_id']);
        $this->assertNull(WC()->session);
    }

    public function test_missing_application_password_authentication_rejects_before_session_initialization(): void
    {
        $response = $this->dispatch('/wc/store/v1/cart/kizlo-auth-test', 0, false, [
            SessionHandler::HEADER_USER_EMAIL => $this->customerEmail,
        ]);

        $this->assertSame(401, $response->get_status());
        $this->assertNull($this->permissionUser);
        $this->assertNull(WC()->session);
    }

    public function test_cookie_authenticated_administrator_is_still_rejected(): void
    {
        $response = $this->dispatch('/wc/store/v1/cart/kizlo-auth-test', $this->adminId, false, [
            SessionHandler::HEADER_USER_EMAIL => $this->customerEmail,
        ]);

        $this->assertSame(401, $response->get_status());
        $this->assertNull(WC()->session);
    }

    public function test_application_password_non_administrator_is_rejected_with_403(): void
    {
        $subscriberId = self::factory()->user->create(['role' => 'subscriber']);
        $response     = $this->dispatch('/wc/store/v1/cart/kizlo-auth-test', $subscriberId, true, [
            SessionHandler::HEADER_USER_EMAIL => $this->customerEmail,
        ]);

        $this->assertSame(403, $response->get_status());
        $this->assertNull(WC()->session);
    }

    public function test_malformed_email_and_privileged_identities_are_rejected(): void
    {
        $malformed = SessionHandler::resolveIdentity(
            $this->request('/wc/store/v1/cart', [SessionHandler::HEADER_USER_EMAIL => 'not-an-email']),
            true
        );
        $privileged = SessionHandler::resolveIdentity(
            $this->request('/wc/store/v1/cart', [
                SessionHandler::HEADER_USER_EMAIL => (string) get_userdata($this->adminId)->user_email,
            ]),
            true
        );

        $this->assertInstanceOf(WP_Error::class, $malformed);
        $this->assertSame('kizlo_invalid_identity', $malformed->get_error_code());
        $this->assertInstanceOf(WP_Error::class, $privileged);
        $this->assertSame('kizlo_forbidden_identity', $privileged->get_error_code());
    }

    public function test_email_identity_and_cart_transition_are_accepted(): void
    {
        $identity = SessionHandler::resolveIdentity(
            $this->request('/wc/store/v1/cart', [
                SessionHandler::HEADER_USER_EMAIL  => $this->customerEmail,
                SessionHandler::HEADER_GUEST_TOKEN => self::GUEST_TOKEN,
            ]),
            true
        );

        $this->assertSame(['user_id' => $this->customerId, 'guest_token' => self::GUEST_TOKEN], $identity);
    }

    public function test_unknown_email_creates_a_customer_on_demand(): void
    {
        $this->assertFalse(get_user_by('email', 'new-shopper@example.com'));

        $identity = SessionHandler::resolveIdentity(
            $this->request('/wc/store/v1/cart', [SessionHandler::HEADER_USER_EMAIL => 'new-shopper@example.com']),
            true
        );

        $created = get_user_by('email', 'new-shopper@example.com');
        $this->assertInstanceOf(\WP_User::class, $created);
        $this->assertSame(['user_id' => (int) $created->ID, 'guest_token' => null], $identity);
    }

    public function test_user_plus_guest_is_rejected_for_order_routes(): void
    {
        $identity = SessionHandler::resolveIdentity(
            $this->request('/wc/store/v1/order/1', [
                SessionHandler::HEADER_USER_EMAIL  => $this->customerEmail,
                SessionHandler::HEADER_GUEST_TOKEN => self::GUEST_TOKEN,
            ]),
            false
        );

        $this->assertInstanceOf(WP_Error::class, $identity);
        $this->assertSame('kizlo_conflicting_identity', $identity->get_error_code());
    }

    /** @param array<string, string> $headers */
    private function dispatch(string $route, int $userId, bool $applicationPassword, array $headers = []): WP_REST_Response
    {
        $this->resetWooCommerce();
        $this->permissionUser = null;
        $this->authenticateAs($userId, $applicationPassword);

        return $this->server->dispatch($this->request($route, $headers));
    }

    private function authenticateAs(int $userId, bool $applicationPassword): void
    {
        wp_set_current_user($userId);
        unset($GLOBALS['wp_rest_application_password_uuid']);
        if ($applicationPassword) {
            $GLOBALS['wp_rest_application_password_uuid'] = 'test-application-password';
        }
    }

    /** @param array<string, string> $headers */
    private function request(string $route, array $headers = []): WP_REST_Request
    {
        $request = new WP_REST_Request('GET', $route);
        foreach ($headers as $name => $value) $request->set_header($name, $value);
        return $request;
    }

    private function resetWooCommerce(): void
    {
        if (WC()->session instanceof SessionHandler) {
            remove_action('shutdown', [WC()->session, 'save_data'], 20);
        }
        // @phpstan-ignore instanceof.alwaysTrue
        if (WC()->customer instanceof \WC_Customer) {
            remove_action('shutdown', [WC()->customer, 'save'], 10);
        }

        WC()->session  = null;
        WC()->customer = null;
        WC()->cart     = null;
        SessionHandler::clearPreparedIdentity();
        unset($GLOBALS['wp_rest_application_password_uuid']);
    }
}
