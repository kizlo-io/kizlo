<?php

namespace Kizlo\WooCommerce\Tests\WooCommerce;

use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use Kizlo\Modules\RestApi\RestGuard;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceModule;
use Kizlo\WooCommerce\Tests\TestCase;

class WooCommerceModuleTest extends TestCase
{
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
        $this->customerId    = self::factory()->user->create(['role' => 'subscriber']);
        $this->customerEmail = (string) get_userdata($this->customerId)->user_email;
        $this->guard         = new RestGuard();
        $this->module     = new WooCommerceModule();

        add_filter('rest_authentication_errors', [$this->guard, 'requireAdmin'], 100);
        add_filter('woocommerce_session_handler', [$this->module, 'maybeUseHeadlessSession']);
        add_filter('woocommerce_store_api_disable_nonce_check', [$this->module, 'maybeDisableNonceCheck']);
        add_filter('rest_request_before_callbacks', [$this->module, 'maybeSwitchStoreApiUser'], 10, 3);
        add_filter('rest_dispatch_request', [$this->module, 'maybeSwitchKizloCartUser'], 10, 4);

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

        remove_filter('rest_authentication_errors', [$this->guard, 'requireAdmin'], 100);
        remove_filter('woocommerce_session_handler', [$this->module, 'maybeUseHeadlessSession']);
        remove_filter('woocommerce_store_api_disable_nonce_check', [$this->module, 'maybeDisableNonceCheck']);
        remove_filter('rest_request_before_callbacks', [$this->module, 'maybeSwitchStoreApiUser'], 10);
        remove_filter('rest_dispatch_request', [$this->module, 'maybeSwitchKizloCartUser'], 10);

        unset(
            $_SERVER['PHP_AUTH_USER'],
            $_SERVER['HTTP_AUTHORIZATION'],
            $_SERVER['HTTP_X_KIZLO_USER_EMAIL'],
        );
        $_SERVER['REQUEST_URI'] = '/';

        parent::tearDown();
    }

    public function registerTestRoutes(): void
    {
        foreach (['wc/store/v1' => '/kizlo-auth-test', KIZLO_API_NAMESPACE => '/cart/auth-test'] as $namespace => $route) {
            register_rest_route($namespace, $route, [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => function (): bool {
                    $this->permissionUser = get_current_user_id();
                    return true;
                },
                'callback'            => static fn (): WP_REST_Response => new WP_REST_Response([
                    'user_id' => get_current_user_id(),
                ]),
            ]);
        }
    }

    public function test_store_api_permissions_see_the_resolved_customer_after_admin_authentication(): void
    {
        $response = $this->dispatch('/wc/store/v1/kizlo-auth-test', $this->adminId);

        $this->assertSame($this->customerId, $this->permissionUser);
        $this->assertSame($this->customerId, $response->get_data()['user_id']);
        $this->assertTrue(apply_filters('woocommerce_store_api_disable_nonce_check', false));
    }

    public function test_kizlo_cart_permissions_see_the_admin_before_the_callback_sees_the_customer(): void
    {
        $response = $this->dispatch('/' . KIZLO_API_NAMESPACE . '/cart/auth-test', $this->adminId);

        $this->assertSame($this->adminId, $this->permissionUser);
        $this->assertSame($this->customerId, $response->get_data()['user_id']);
    }

    public function test_unauthenticated_store_requests_do_not_initialize_a_session(): void
    {
        $response = $this->dispatch('/wc/store/v1/kizlo-auth-test', 0);

        $this->assertSame(401, $response->get_status());
        $this->assertNull($this->permissionUser);
        $this->assertNull(WC()->session);
        $this->assertSame(0, get_current_user_id());
    }

    public function test_non_admin_store_requests_do_not_initialize_a_session(): void
    {
        $subscriberId = self::factory()->user->create(['role' => 'subscriber']);
        $response     = $this->dispatch('/wc/store/v1/kizlo-auth-test', $subscriberId);

        $this->assertSame(403, $response->get_status());
        $this->assertNull($this->permissionUser);
        $this->assertNull(WC()->session);
        $this->assertSame($subscriberId, get_current_user_id());
    }

    private function dispatch(string $route, int $authenticatedUser): WP_REST_Response
    {
        $this->resetWooCommerce();
        $this->permissionUser = null;

        wp_set_current_user($authenticatedUser);
        $_SERVER['REQUEST_URI']             = '/wp-json' . $route;
        $_SERVER['HTTP_X_KIZLO_USER_EMAIL'] = $this->customerEmail;

        if ($authenticatedUser === $this->adminId) {
            $_SERVER['PHP_AUTH_USER'] = 'administrator';
        } else {
            unset($_SERVER['PHP_AUTH_USER'], $_SERVER['HTTP_AUTHORIZATION']);
        }

        // WP_REST_Server::dispatch() starts after serve_request() has checked
        // authentication, so reproduce that production gate explicitly.
        $authentication = apply_filters('rest_authentication_errors', null);
        if (is_wp_error($authentication)) {
            return rest_convert_error_to_response($authentication);
        }

        return $this->server->dispatch(new WP_REST_Request('GET', $route));
    }

    private function resetWooCommerce(): void
    {
        if (WC()->session instanceof SessionHandler) {
            remove_action('shutdown', [WC()->session, 'save_data'], 20);
        }
        if (WC()->customer instanceof \WC_Customer) {
            remove_action('shutdown', [WC()->customer, 'save'], 10);
        }

        WC()->session  = null;
        WC()->customer = null;
        WC()->cart     = null;
    }
}
