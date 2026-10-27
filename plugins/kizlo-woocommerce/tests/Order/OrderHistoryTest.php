<?php

namespace Kizlo\WooCommerce\Tests\Order;

use Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema;
use Kizlo\WooCommerce\Modules\Order\OrderModule;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_Customer;
use WC_Order;
use WC_Product_Simple;
use WP_REST_Request;
use WP_REST_Response;

class OrderHistoryTest extends TestCase
{
    private int $customerId;
    private string $email = 'history-owner@example.com';

    public function setUp(): void
    {
        parent::setUp();
        $this->customerId = self::factory()->user->create(['role' => 'customer', 'user_email' => $this->email]);
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));
        $GLOBALS['wp_rest_application_password_uuid'] = 'test-application-password';
        (new OrderModule())->register();
        $this->bootRestServer();
    }

    public function tearDown(): void
    {
        if (WC()->session instanceof SessionHandler) {
            remove_action('shutdown', [WC()->session, 'save_data'], 20);
        }
        if (WC()->customer instanceof WC_Customer) {
            remove_action('shutdown', [WC()->customer, 'save'], 10);
        }
        WC()->session = null;
        WC()->customer = null;
        WC()->cart = null;
        unset($GLOBALS['wp_rest_application_password_uuid']);
        SessionHandler::clearPreparedIdentity();
        parent::tearDown();
    }

    public function test_history_is_scoped_paginated_and_uses_the_same_order_enrichment_as_get(): void
    {
        $older = $this->order($this->customerId);
        $newer = $this->order($this->customerId);
        $this->order(self::factory()->user->create(['role' => 'customer']));
        $this->order(0);
        $this->order($this->customerId, 'checkout-draft');

        $response = $this->history(['per_page' => 1, 'customer_id' => 0, 'email' => 'other@example.com']);
        $this->assertSame(200, $response->get_status());
        $this->assertSame([$newer->get_id()], array_column($response->get_data(), 'id'));
        $this->assertSame(2, $response->get_headers()['X-WP-Total']);
        $this->assertSame(2, $response->get_headers()['X-WP-TotalPages']);
        $this->assertSame('private, no-store', $response->get_headers()['Cache-Control']);

        $raw = new WP_REST_Response($response->get_data()[0]);
        $get = (new OrderModule())->extendStoreOrderItems($raw, null, new WP_REST_Request('GET', '/wc/store/v1/order/' . $newer->get_id()));
        $this->assertEquals($response->get_data()[0], $get->get_data());
        $this->assertSame((string) $newer->get_order_number(), $get->get_data()['extensions']['kizlo']['number']);
        $this->assertSame('2026-01-02T03:04:05', $get->get_data()['extensions']['kizlo']['date_created_gmt']);

        $page2 = $this->history(['page' => 2, 'per_page' => 1]);
        $this->assertSame([$older->get_id()], array_column($page2->get_data(), 'id'));
        $empty = $this->history(['page' => 3, 'per_page' => 1]);
        $this->assertSame([], $empty->get_data());
        $this->assertSame(2, $empty->get_headers()['X-WP-Total']);
    }

    public function test_empty_customer_history_is_a_successful_empty_collection(): void
    {
        $response = $this->history();
        $this->assertSame(200, $response->get_status());
        $this->assertSame([], $response->get_data());
        $this->assertSame(0, $response->get_headers()['X-WP-Total']);
        $this->assertSame(0, $response->get_headers()['X-WP-TotalPages']);
    }

    public function test_get_and_list_render_prices_and_extensions_as_the_customer(): void
    {
        $product = new WC_Product_Simple();
        $product->set_name('Customer-priced order product');
        $product->set_regular_price('12');
        $product->save();
        $order = $this->order($this->customerId);
        $order->add_product($product, 1);
        $order->calculate_totals();
        $order->save();

        $administrator = new WC_Customer(get_current_user_id());
        WC()->customer = $administrator;
        add_action('shutdown', [$administrator, 'save'], 10);
        $customerId = $this->customerId;
        add_filter('woocommerce_product_get_price', static fn($price): string =>
            get_current_user_id() === $customerId && WC()->customer?->get_id() === $customerId ? '12' : '99'
        );
        woocommerce_store_api_register_endpoint_data([
            'namespace' => 'history-viewer',
            'endpoint' => ProductSchema::IDENTIFIER,
            'data_callback' => static fn(): array => [
                'user_id' => get_current_user_id(),
                'customer_id' => WC()->customer?->get_id(),
                'is_admin' => current_user_can('manage_options'),
            ],
            'schema_callback' => static fn(): array => [
                'user_id' => ['type' => 'integer'],
                'customer_id' => ['type' => 'integer'],
                'is_admin' => ['type' => 'boolean'],
            ],
            'schema_type' => ARRAY_A,
        ]);

        $list = $this->history();
        $this->assertSame(200, $list->get_status());
        $item = $list->get_data()[0]['items'][0];
        $this->assertSame('1200', ((array) $item['prices'])['price']);
        $this->assertSame([
            'user_id' => $customerId,
            'customer_id' => $customerId,
            'is_admin' => false,
        ], $item['extensions']['history-viewer']);
        $this->assertFalse(has_action('shutdown', [$administrator, 'save']));
        $this->assertNull(WC()->session, 'History must not initialize or merge a cart session.');

        (new WooCommerceModule())->register();
        $request = new WP_REST_Request('GET', '/wc/store/v1/order/' . $order->get_id());
        $request->set_header(SessionHandler::HEADER_USER_EMAIL, $this->email);
        $get = rest_do_request($request);
        $get = apply_filters('rest_post_dispatch', $get, rest_get_server(), $request);
        $this->assertSame(200, $get->get_status());
        $getItem = $get->get_data()['items'][0];
        $this->assertEquals($getItem['prices'], $item['prices']);
        $this->assertSame($getItem['extensions']['history-viewer'], $item['extensions']['history-viewer']);
    }

    public function test_custom_status_custom_number_and_paid_state_are_preserved(): void
    {
        register_post_status('wc-awaiting-pickup', ['label' => 'Awaiting pickup', 'public' => true]);
        add_filter('wc_order_statuses', static fn(array $statuses): array => $statuses + ['wc-awaiting-pickup' => 'Awaiting pickup']);
        add_filter('woocommerce_order_is_paid_statuses', static fn(array $statuses): array => [...$statuses, 'awaiting-pickup']);
        add_filter('woocommerce_order_number', static fn($number): string => 'STORE-' . $number);
        $order = $this->order($this->customerId, 'awaiting-pickup');

        $data = $this->history()->get_data()[0];
        $this->assertSame('awaiting-pickup', $data['status']);
        $this->assertSame('STORE-' . $order->get_id(), $data['extensions']['kizlo']['number']);
        $this->assertTrue($data['extensions']['kizlo']['is_paid']);
    }

    public function test_customer_scope_cannot_be_selected_without_a_trusted_session(): void
    {
        $this->order($this->customerId);
        foreach ([null, 'not-an-email'] as $email) {
            $response = $this->history(['customer_id' => $this->customerId, 'email' => $this->email], $email);
            $this->assertSame($email === null ? 403 : 401, $response->get_status());
            $this->assertSame('private, no-store', $response->get_headers()['Cache-Control']);
        }
        unset($GLOBALS['wp_rest_application_password_uuid']);
        wp_set_current_user(0);
        $this->assertSame(401, $this->history()->get_status());
    }

    public function test_pagination_bounds_are_validated_by_the_route(): void
    {
        foreach ([['page' => 0], ['page' => 1.5], ['per_page' => 0], ['per_page' => 101]] as $params) {
            $response = $this->history($params);
            $this->assertSame(400, $response->get_status());
            $this->assertSame('private, no-store', $response->get_headers()['Cache-Control']);
        }
    }

    private function order(int $customerId, string $status = 'pending'): WC_Order
    {
        $order = wc_create_order(['customer_id' => $customerId, 'status' => $status]);
        $order->set_date_created(strtotime('2026-01-02T08:34:05+05:30'));
        $order->save();
        return $order;
    }

    private function history(array $params = [], ?string $email = 'history-owner@example.com'): WP_REST_Response
    {
        $request = new WP_REST_Request('GET', '/kizlo/v1/woocommerce/orders');
        $request->set_query_params($params);
        if ($email !== null) $request->set_header(SessionHandler::HEADER_USER_EMAIL, $email);
        $serviceUser = get_current_user_id();
        try {
            $response = rest_do_request($request);
            return apply_filters('rest_post_dispatch', $response, rest_get_server(), $request);
        } finally {
            wp_set_current_user($serviceUser);
        }
    }
}
