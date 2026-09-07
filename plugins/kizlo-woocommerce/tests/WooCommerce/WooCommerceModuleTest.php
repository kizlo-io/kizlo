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

        register_rest_route('wc-admin', '/kizlo-admin-test', [
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

    public function test_route_policy_guards_the_store_api_and_defers_other_woocommerce_routes(): void
    {
        foreach ([
            '/wc/store/v1/cart',
            '/wc/store/v1/cart/items',
            '/wc/store/v1/checkout',
            '/wc/store/v1/order/12',
            '/wc/store/v1/products',
            '/wc/store/v1/product-collection-data',
        ] as $route) {
            $this->assertTrue($this->module->requiresKizloAdmin(true, new WP_REST_Request('GET', $route)), $route);
        }

        foreach ([
            '/wc/v3/products',
            '/wc/v3/customers',
            '/wc/v3/orders/12',
            '/wc-admin/options',
            '/wc-analytics/reports',
        ] as $route) {
            $this->assertFalse($this->module->requiresKizloAdmin(true, new WP_REST_Request('GET', $route)), $route);
        }

        $this->assertTrue($this->module->requiresKizloAdmin(true, new WP_REST_Request('GET', '/wp/v2/posts')));
        $this->assertFalse($this->module->requiresKizloAdmin(false, new WP_REST_Request('GET', '/wp/v2/posts')));
    }

    public function test_cookie_authenticated_administrator_reaches_wc_admin_routes(): void
    {
        $response = $this->dispatch('/wc-admin/kizlo-admin-test', $this->adminId, false);

        $this->assertSame(200, $response->get_status());
        $this->assertSame($this->adminId, $this->permissionUser);
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

    public function test_catalog_routes_ignore_identity_headers_and_do_not_initialize_a_session(): void
    {
        $response = $this->dispatch('/wc/store/v1/kizlo-public-test', $this->adminId, true, [
            SessionHandler::HEADER_USER_EMAIL => $this->customerEmail,
        ]);

        $this->assertSame(200, $response->get_status());
        $this->assertSame($this->adminId, $this->permissionUser);
        $this->assertSame($this->adminId, $response->get_data()['user_id']);
        $this->assertNull(WC()->session);
    }

    public function test_catalog_routes_reject_callers_without_an_application_password(): void
    {
        $response = $this->dispatch('/wc/store/v1/kizlo-public-test', 0, false, [
            SessionHandler::HEADER_USER_EMAIL => $this->customerEmail,
        ]);

        $this->assertSame(401, $response->get_status());
        $this->assertNull($this->permissionUser);
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

    /**
     * A checkout-draft is the route rebuilding its draft; a pending order is the
     * route still returning an unpaid order (returning to checkout after starting
     * an online payment). Both serialize without their live cart and both must be
     * filled from the session.
     *
     * @dataProvider provide_missing_draft_cart_statuses
     */
    public function test_checkout_get_fills_a_missing_draft_cart_from_the_live_session(string $status): void
    {
        $product = new \WC_Product_Simple();
        $product->set_name('Checkout draft cart');
        $product->set_regular_price('10');
        $product->set_status('publish');
        $product->save();

        $request = $this->request('/wc/store/v1/checkout');
        $this->authenticateAs($this->adminId, true);
        $this->module->maybeSwitchStoreApiUser(null, null, $request);
        WC()->cart->add_to_cart($product->get_id());

        $response = new WP_REST_Response([
            'status'             => $status,
            '__experimentalCart' => null,
        ]);

        $result = $this->module->addCheckoutDraftCart($response, $this->server, $request);
        $cart   = (array) $result->get_data()['__experimentalCart'];

        $this->assertSame($response, $result);
        $this->assertSame(1, $cart['items_count']);
        $this->assertCount(1, $cart['items']);
        $this->assertSame($product->get_id(), $cart['items'][0]['id']);
    }

    /** @return array<string, array{string}> */
    public function provide_missing_draft_cart_statuses(): array
    {
        return [
            'checkout-draft' => ['checkout-draft'],
            'pending'        => ['pending'],
            'failed'         => ['failed'],
        ];
    }

    public function test_checkout_get_keeps_an_existing_cart_untouched(): void
    {
        $cart     = (object) ['marker' => true];
        $request  = $this->request('/wc/store/v1/checkout');
        $response = new WP_REST_Response([
            'status'             => 'checkout-draft',
            '__experimentalCart' => $cart,
        ]);

        $result = $this->module->addCheckoutDraftCart($response, $this->server, $request);

        $this->assertSame($cart, $result->get_data()['__experimentalCart']);
    }

    public function test_checkout_draft_cart_normalization_is_scoped_to_successful_gets(): void
    {
        foreach ([
            ['POST', 'checkout-draft', 200],
            ['GET', 'completed', 200],
            ['GET', 'checkout-draft', 400],
        ] as [$method, $status, $httpStatus]) {
            $request  = new WP_REST_Request($method, '/wc/store/v1/checkout');
            $response = new WP_REST_Response([
                'status'             => $status,
                '__experimentalCart' => null,
            ], $httpStatus);

            $result = $this->module->addCheckoutDraftCart($response, $this->server, $request);

            $this->assertNull($result->get_data()['__experimentalCart'], "$method $status $httpStatus");
        }
    }

    public function test_checkout_order_processed_stamps_the_owning_session_key(): void
    {
        $request = $this->request('/wc/store/v1/checkout', [
            SessionHandler::HEADER_USER_EMAIL => $this->customerEmail,
        ]);
        $this->authenticateAs($this->adminId, true);
        $this->module->maybeSwitchStoreApiUser(null, null, $request);

        $order = new \WC_Order();
        $order->save();

        $this->module->captureOrderSessionKey($order);

        $stored = wc_get_order($order->get_id());
        $this->assertSame((string) $this->customerId, $stored->get_meta('_kizlo_session_key'));
    }

    public function test_checkout_order_processed_ignores_non_headless_sessions(): void
    {
        $order = new \WC_Order();
        $order->save();

        $this->module->captureOrderSessionKey($order);

        $this->assertSame('', wc_get_order($order->get_id())->get_meta('_kizlo_session_key'));
    }

    /**
     * A guest keeps only a "t_" token and a logged-in customer a numeric key;
     * both are stamped on the order at checkout, so a paid transition reaching
     * the order off-session (a gateway webhook, no request session) empties the
     * owning session row directly.
     *
     * @dataProvider provide_owning_session_keys
     */
    public function test_paid_transition_empties_the_owning_session_off_session(string $key): void
    {
        $this->seedSessionCart($key);

        $order = new \WC_Order();
        $order->update_meta_data('_kizlo_session_key', $key);
        $order->save();

        $this->module->clearCartForPaidOrder($order->get_id(), 'pending', 'processing', $order);

        $data = $this->readSession($key);
        $this->assertArrayNotHasKey('cart', $data);
        $this->assertArrayNotHasKey('store_api_draft_order', $data);
    }

    /** @return array<string, array{string}> */
    public function provide_owning_session_keys(): array
    {
        return [
            'guest'     => [self::GUEST_TOKEN],
            'logged in' => ['42'],
        ];
    }

    public function test_non_paid_transition_keeps_the_owning_cart(): void
    {
        $this->seedSessionCart(self::GUEST_TOKEN);

        $order = new \WC_Order();
        $order->update_meta_data('_kizlo_session_key', self::GUEST_TOKEN);
        $order->save();

        $this->module->clearCartForPaidOrder($order->get_id(), 'pending', 'on-hold', $order);

        $this->assertArrayHasKey('cart', $this->readSession(self::GUEST_TOKEN));
    }

    public function test_paid_transition_ignores_an_order_without_a_session_key(): void
    {
        $this->seedSessionCart(self::GUEST_TOKEN);

        $order = new \WC_Order();
        $order->save();

        $this->module->clearCartForPaidOrder($order->get_id(), 'pending', 'processing', $order);

        $this->assertArrayHasKey('cart', $this->readSession(self::GUEST_TOKEN));
    }

    private function seedSessionCart(string $key): void
    {
        global $wpdb;
        $wpdb->replace(
            $wpdb->prefix . 'woocommerce_sessions',
            [
                'session_key'    => $key,
                'session_value'  => maybe_serialize([
                    'cart'                  => maybe_serialize(['abc' => ['product_id' => 1, 'quantity' => 1]]),
                    'store_api_draft_order' => 123,
                ]),
                'session_expiry' => time() + SessionHandler::SESSION_LIFETIME,
            ],
            ['%s', '%s', '%d']
        );
    }

    /** @return array<string, mixed> */
    private function readSession(string $key): array
    {
        global $wpdb;
        $value = $wpdb->get_var($wpdb->prepare(
            'SELECT session_value FROM %i WHERE session_key = %s',
            $wpdb->prefix . 'woocommerce_sessions',
            $key
        ));
        $data = maybe_unserialize((string) $value);

        return is_array($data) ? $data : [];
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
