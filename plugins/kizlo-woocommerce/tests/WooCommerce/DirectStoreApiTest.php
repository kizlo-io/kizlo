<?php

namespace Kizlo\WooCommerce\Tests\WooCommerce;

use Automattic\WooCommerce\StoreApi\Utilities\CartTokenUtils;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WP_REST_Request;
use WP_REST_Response;

final class DirectStoreApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        wp_set_current_user(0);
        unset($GLOBALS['wp_rest_application_password_uuid']);
        $this->resetCart();
        (new WooCommerceModule())->register();
        $this->bootRestServer();
    }

    protected function tearDown(): void
    {
        $this->resetCart();
        unset($_SERVER['HTTP_CART_TOKEN']);
        parent::tearDown();
    }

    public function test_guest_cart_read_returns_native_proof_and_mutations_require_it(): void
    {
        $read = $this->dispatch('GET', '/cart');
        self::assertSame(200, $read->get_status());
        $token = $read->get_headers()['Cart-Token'];
        self::assertTrue(CartTokenUtils::validate_cart_token($token));
        $guest = WC()->session->get_customer_id();
        $product = new \WC_Product_Simple();
        $product->set_name('Direct API product');
        $product->set_regular_price('10');
        $product->save();

        $denied = $this->dispatch('POST', '/cart/add-item', null, ['id' => $product->get_id(), 'quantity' => 1]);
        self::assertSame(401, $denied->get_status());
        self::assertSame(0, WC()->cart->get_cart_contents_count());
        $added = $this->dispatch('POST', '/cart/add-item', $token, ['id' => $product->get_id(), 'quantity' => 2]);
        self::assertSame(201, $added->get_status(), wp_json_encode($added->get_data()));
        self::assertSame(2, $added->get_data()['items'][0]['quantity']);
        self::assertSame($guest, WC()->session->get_customer_id());
        self::assertFalse(apply_filters('woocommerce_store_api_disable_nonce_check', false));
    }

    public function test_a_tampered_or_other_customer_cart_is_rejected_before_loading_it(): void
    {
        $owner = self::factory()->user->create(['role' => 'customer', 'user_email' => 'cart-owner@example.com']);
        $token = CartTokenUtils::get_cart_token((string) $owner);
        self::assertSame(401, $this->dispatch('GET', '/cart', $token)->get_status());
        self::assertNull(WC()->session);
        self::assertSame(401, $this->dispatch('GET', '/cart', $token . 'broken')->get_status());
        self::assertNull(WC()->session);
        $request = new WP_REST_Request('GET', '/wc/store/v1/cart');
        $request->set_header('Cart-Token', $token);
        $this->signRequest($request, 'different-customer@example.com');
        self::assertSame(401, rest_do_request($request)->get_status());
        self::assertNull(WC()->session);
    }

    public function test_checkout_cannot_create_an_unverified_wordpress_account(): void
    {
        $token = CartTokenUtils::get_cart_token('t_0123456789abcdef0123456789abcd');
        $response = $this->dispatch('POST', '/checkout', $token, ['create_account' => true, 'billing_address' => ['email' => 'guest@example.com']]);
        self::assertSame(403, $response->get_status(), wp_json_encode($response->get_data()));
        self::assertSame('kizlo_verified_account_required', $response->get_data()['code']);
    }

    private function dispatch(string $method, string $route, ?string $token = null, array $params = []): WP_REST_Response
    {
        $request = new WP_REST_Request($method, '/wc/store/v1' . $route);
        unset($_SERVER['HTTP_CART_TOKEN']);
        if ($token !== null) {
            $_SERVER['HTTP_CART_TOKEN'] = $token;
            $request->set_header('Cart-Token', $token);
        }
        $request->set_body_params($params);
        return rest_do_request($request);
    }

    private function resetCart(): void
    {
        if (WC()->session instanceof SessionHandler) remove_action('shutdown', [WC()->session, 'save_data'], 20);
        if (WC()->customer instanceof \WC_Customer) remove_action('shutdown', [WC()->customer, 'save'], 10);
        WC()->session = null;
        WC()->customer = null;
        WC()->cart = null;
        unset($GLOBALS['wp_actions']['woocommerce_load_cart_from_session'], $GLOBALS['wp_actions']['woocommerce_after_calculate_totals']);
        SessionHandler::clearPreparedIdentity();
    }
}
