<?php

namespace Kizlo\Pos\Tests\Checkout;

use Kizlo\Pos\Modules\Checkout\{Calculator, CheckoutModule, CheckoutError, Customer, Input, PaymentPage, Sale};
use Kizlo\Pos\Modules\Notification\{Channel, Notifications};
use WP_REST_Request;
use WP_UnitTestCase;

final class CheckoutTest extends WP_UnitTestCase
{
    private int $staff;
    private \WC_Product_Simple $product;

    protected function setUp(): void
    {
        parent::setUp();
        \WC_Install::create_roles();
        wp_roles()->init_roles();
        $this->staff = self::factory()->user->create(['role' => 'shop_manager']);
        wp_set_current_user($this->staff);
        update_option('woocommerce_default_country', 'US:CA');
        update_option('woocommerce_store_address', '123 Store Street');
        update_option('woocommerce_store_city', 'San Francisco');
        update_option('woocommerce_store_postcode', '94105');
        foreach (['first_name', 'last_name', 'email', 'phone', 'billing', 'shipping'] as $field) delete_option('kizlo_pos_collect_' . $field);
        $this->product = new \WC_Product_Simple();
        $this->product->set_name('Counter item');
        $this->product->set_regular_price('10');
        $this->product->set_virtual(true);
        $this->product->set_manage_stock(true);
        $this->product->set_stock_quantity(5);
        $this->product->save();
        $cod = WC()->payment_gateways()->payment_gateways()['cod'];
        $cod->enabled = 'yes';
        $cod->enable_for_virtual = true;
        $GLOBALS['wp_rest_server'] = null;
        (new CheckoutModule())->register();
        rest_get_server();
    }

    protected function tearDown(): void
    {
        $_GET = $_POST = [];
        wp_set_current_user(0);
        parent::tearDown();
    }

    private function body(): array
    {
        return ['items' => [['id' => $this->product->get_id(), 'quantity' => 1]], 'contact' => [], 'billing' => [], 'shipping' => [], 'rates' => []];
    }

    private function request(string $path, string $method = 'POST', ?array $body = null): \WP_REST_Response
    {
        $request = new WP_REST_Request($method, '/kizlo/v1/pos' . $path);
        if ($body !== null) { $request->set_header('Content-Type', 'application/json'); $request->set_body(wp_json_encode($body)); }
        return rest_do_request($request);
    }

    private function cash(?array $body = null): array
    {
        $body ??= $this->body();
        $quote = $this->request('/checkout/quote', 'POST', $body);
        $this->assertSame(200, $quote->get_status(), wp_json_encode($quote->get_data()));
        return $body + ['sale_id' => wp_generate_uuid4(), 'fingerprint' => $quote->get_data()['fingerprint'], 'method' => 'cash'];
    }

    public function test_staff_routes_keep_namespace_permissions_and_configuration(): void
    {
        $response = $this->request('/checkout/config', 'GET');
        $this->assertSame(200, $response->get_status());
        $this->assertSame('123 Store Street', $response->get_data()['store_address']['address_1']);
        $this->assertFalse($response->get_data()['fields']['email']);
        foreach (['subscriber', 'customer'] as $role) {
            wp_set_current_user(self::factory()->user->create(['role' => $role]));
            $this->assertSame(403, $this->request('/checkout/config', 'GET')->get_status());
        }
        wp_set_current_user(0);
        $this->assertSame(401, $this->request('/checkout/config', 'GET')->get_status());
    }

    public function test_scan_validates_cart_without_checkout_fields_or_mutations(): void
    {
        $this->product->set_sku('COUNTER'); $this->product->save();
        update_option('kizlo_pos_collect_email', 'yes');
        update_option('woocommerce_store_address', '');
        $cart = WC()->cart;
        $contents = $cart->get_cart_contents();
        $customer = WC()->customer;
        $users = count_users()['total_users'];
        $orders = wc_get_orders(['return' => 'ids']);
        $response = $this->request('/cart/scan', 'POST', ['code' => 'COUNTER', 'items' => []]);
        $this->assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        $this->assertSame(['id' => $this->product->get_id(), 'name' => 'Counter item', 'quantity' => 1], $response->get_data());
        $response = $this->request('/cart/scan', 'POST', ['code' => 'COUNTER', 'items' => $this->body()['items']]);
        $this->assertSame(2, $response->get_data()['quantity']);
        $this->assertSame($cart, WC()->cart);
        $this->assertSame($contents, $cart->get_cart_contents());
        $this->assertSame($customer, WC()->customer);
        $this->assertSame($users, count_users()['total_users']);
        $this->assertSame($orders, wc_get_orders(['return' => 'ids']));
        $this->assertSame(5, wc_get_product($this->product->get_id())->get_stock_quantity());
    }

    public function test_scan_rejects_missing_unavailable_and_excess_quantities(): void
    {
        $this->product->set_sku('COUNTER'); $this->product->save();
        $this->assertSame(404, $this->request('/cart/scan', 'POST', ['code' => 'MISSING', 'items' => []])->get_status());
        $body = ['code' => 'COUNTER', 'items' => [['id' => $this->product->get_id(), 'quantity' => 5]]];
        $this->assertSame(409, $this->request('/cart/scan', 'POST', $body)->get_status());
        $this->product->set_sold_individually(true); $this->product->save();
        $body['items'][0]['quantity'] = 1;
        $this->assertSame(409, $this->request('/cart/scan', 'POST', $body)->get_status());
        $this->product->set_regular_price(''); $this->product->save();
        $this->assertSame(409, $this->request('/cart/scan', 'POST', ['code' => 'COUNTER', 'items' => []])->get_status());
        $body['items'][0]['quantity'] = 10000;
        $this->assertSame(409, $this->request('/cart/scan', 'POST', $body)->get_status());
        $body['items'][0]['quantity'] = 1.5;
        $this->assertSame(400, $this->request('/cart/scan', 'POST', $body)->get_status());
        wp_set_current_user(self::factory()->user->create(['role' => 'customer']));
        $this->assertSame(403, $this->request('/cart/scan', 'POST', $body)->get_status());
        wp_set_current_user(0);
        $this->assertSame(401, $this->request('/cart/scan', 'POST', $body)->get_status());
    }

    public function test_quote_uses_full_store_address_and_never_mutates_staff_or_creates_customer(): void
    {
        update_user_meta($this->staff, 'billing_city', 'Cashier city');
        $session = WC()->session;
        $customer = WC()->customer;
        $cart = WC()->cart;
        $count = count_users()['total_users'];
        $body = $this->body();
        $body['contact'] = ['email' => 'new-customer@example.com'];
        $response = $this->request('/checkout/quote', 'POST', $body);
        $this->assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        $quote = $response->get_data();
        $this->assertSame('1000', $quote['total']);
        $this->assertSame('store', $quote['sources']['shipping']);
        $this->assertSame('94105', $quote['addresses']['shipping']['postcode']);
        $this->assertSame($count, count_users()['total_users']);
        $this->assertSame($session, WC()->session);
        $this->assertSame($customer, WC()->customer);
        $this->assertSame($cart, WC()->cart);
        $this->assertSame('Cashier city', get_user_meta($this->staff, 'billing_city', true));
    }

    public function test_enabled_fields_invalid_input_and_stale_quote_stop_sale(): void
    {
        update_option('kizlo_pos_collect_email', 'yes');
        $this->assertSame(400, $this->request('/checkout/quote', 'POST', $this->body())->get_status());
        delete_option('kizlo_pos_collect_email');
        $body = $this->cash();
        $this->product->set_regular_price('12'); $this->product->save();
        $response = $this->request('/checkout', 'POST', $body);
        $this->assertSame(409, $response->get_status());
        $this->assertArrayHasKey('quote', $response->get_data()['data']);
        $this->assertFalse((bool) get_option(Sale::option($body['sale_id'])));
        $body = $this->body(); $body['items'][0]['quantity'] = 1.5;
        $this->assertSame(400, $this->request('/checkout/quote', 'POST', $body)->get_status());
    }

    public function test_counter_cash_is_paid_guest_and_retries_do_not_reduce_stock_twice(): void
    {
        $body = $this->cash();
        $first = $this->request('/checkout', 'POST', $body);
        $this->assertSame(200, $first->get_status(), wp_json_encode($first->get_data()));
        $this->assertTrue($first->get_data()['paid']);
        $order = wc_get_order($first->get_data()['order_id']);
        $this->assertSame(0, $order->get_customer_id());
        $this->assertSame('cod', $order->get_payment_method());
        $this->assertNotNull($order->get_date_paid());
        $this->assertSame('processing', $order->get_status());
        $this->assertSame(4, wc_get_product($this->product->get_id())->get_stock_quantity());
        $second = $this->request('/checkout', 'POST', $body);
        $this->assertSame($order->get_id(), $second->get_data()['order_id']);
        $this->assertSame(4, wc_get_product($this->product->get_id())->get_stock_quantity());
        $body['items'][0]['quantity'] = 2;
        $this->assertSame(409, $this->request('/checkout', 'POST', $body)->get_status());
        wp_set_current_user(self::factory()->user->create(['role' => 'shop_manager']));
        $this->assertSame(404, $this->request('/checkout/' . $body['sale_id'], 'GET')->get_status());
    }

    public function test_paid_pos_cash_email_omits_pay_later_instructions_without_changing_web_cod(): void
    {
        $body = $this->cash();
        $sale = $this->request('/checkout', 'POST', $body)->get_data();
        $order = wc_get_order($sale['order_id']);
        $cod = WC()->payment_gateways()->payment_gateways()['cod'];
        $cod->instructions = 'Pay the driver on delivery.';
        // WP restores hooks between tests while Woo retains the gateway singleton.
        add_action('woocommerce_email_before_order_table', [$cod, 'email_instructions'], 10, 3);
        ob_start(); do_action('woocommerce_email_before_order_table', $order, false, true); $pos = ob_get_clean();
        $this->assertStringNotContainsString('Pay the driver', $pos);
        $this->assertSame('Pay the driver on delivery.', $cod->instructions);
        $web = new \WC_Order(); $web->set_payment_method('cod'); $web->save();
        ob_start(); do_action('woocommerce_email_before_order_table', $web, false, true); $normal = ob_get_clean();
        $this->assertStringContainsString('Pay the driver', $normal);
    }

    public function test_customer_phone_creation_reuse_placeholder_and_conflict(): void
    {
        $contact = ['first_name' => '', 'last_name' => '', 'email' => '', 'phone' => '+14155552671'];
        $id = Customer::resolve($contact);
        $this->assertSame($id, Customer::resolve($contact));
        $this->assertSame('+14155552671', get_user_meta($id, 'billing_phone', true));
        $this->assertStringEndsWith('@pos.invalid', get_userdata($id)->user_email);
        $this->assertSame('yes', get_user_meta($id, '_kizlo_pos_placeholder_email', true));
        $other = self::factory()->user->create(['role' => 'customer', 'user_email' => 'other@example.com']);
        $this->expectException(CheckoutError::class);
        // Both identifiers resolving to different accounts must never merge.
        Customer::resolve(array_merge($contact, ['email' => get_userdata($other)->user_email]));
    }

    public function test_phone_normalization_retains_country_and_rejects_invalid_numbers(): void
    {
        $this->assertSame('+14155552671', Input::phone('(415) 555-2671', 'US'));
        $this->expectException(CheckoutError::class);
        Input::phone('000', 'US');
    }

    public function test_strict_barcode_lookup_preserves_zeroes_and_finds_variation(): void
    {
        $this->product->set_global_unique_id('012345678905'); $this->product->save();
        $request = new WP_REST_Request('GET', '/kizlo/v1/pos/barcode');
        $request->set_query_params(['code' => '0012345678905']);
        $response = rest_do_request($request);
        $this->assertSame(200, $response->get_status());
        $this->assertSame($this->product->get_id(), $response->get_data()['id']);
        $other = new \WC_Product_Simple(); $other->set_name('Duplicate'); $other->set_regular_price('2'); $other->save();
        update_post_meta($other->get_id(), '_global_unique_id', '0012345678905');
        $this->assertSame(409, rest_do_request($request)->get_status());
    }

    public function test_code128_punctuation_and_spaces_are_not_silently_sanitized(): void
    {
        update_post_meta($this->product->get_id(), '_global_unique_id', ' BOX <123> ');
        $request = new WP_REST_Request('GET', '/kizlo/v1/pos/barcode');
        $request->set_query_params(['code' => ' BOX <123> ']);
        $this->assertSame($this->product->get_id(), rest_do_request($request)->get_data()['id']);
        $request->set_query_params(['code' => 'BOX']);
        $this->assertSame(404, rest_do_request($request)->get_status());
    }

    public function test_order_payment_capability_is_scoped_expiring_and_not_a_login(): void
    {
        $order = new \WC_Order(); $order->set_created_via('kizlo-pos'); $order->set_total(10); $order->save();
        $url = PaymentPage::url($order);
        parse_str(wp_parse_url($url, PHP_URL_QUERY), $query);
        $this->assertTrue(PaymentPage::valid($order, $query['key'], $query['pos_payment']));
        $this->assertFalse(PaymentPage::valid($order, $query['key'], str_repeat('0', 64)));
        $other = new \WC_Order(); $other->set_created_via('kizlo-pos'); $other->save();
        $this->assertFalse(PaymentPage::valid($other, $other->get_order_key(), $query['pos_payment']));
        $this->assertSame($this->staff, get_current_user_id());
        $order->update_meta_data('_kizlo_pos_payment_expires', time() - 1); $order->save();
        $this->assertFalse(PaymentPage::valid($order, $query['key'], $query['pos_payment']));
    }

    public function test_missing_shipping_rate_blocks_physical_sale(): void
    {
        update_option('woocommerce_ship_to_countries', 'all');
        add_filter('woocommerce_package_rates', '__return_empty_array', PHP_INT_MAX);
        $this->product->set_virtual(false); $this->product->save();
        $this->assertSame(409, $this->request('/checkout/quote', 'POST', $this->body())->get_status());
    }

    public function test_notification_job_replay_is_idempotent_and_reports_acceptance_separately(): void
    {
        $channel = new class implements Channel {
            public int $calls = 0;
            public function id(): string { return 'fixture'; }
            public function label(): string { return 'Fixture'; }
            public function events(): array { return ['pos_payment_request']; }
            public function unavailable(\WC_Order $order, string $event): ?string { return null; }
            public function send(\WC_Order $order, string $event, string $delivery_id, array $context): array { $this->calls++; return ['status' => 'accepted']; }
        };
        add_filter('kizlo_pos_notification_channels', static fn($channels) => [...$channels, $channel]);
        $order = new \WC_Order(); $order->set_created_via('kizlo-pos'); $order->set_total(10); $order->save(); PaymentPage::url($order);
        $id = wp_generate_uuid4();
        $first = Notifications::request($order, 'fixture', $id);
        $second = Notifications::request($order, 'fixture', $id);
        $this->assertSame($first['id'], $second['id']);
        Notifications::deliver($order->get_id(), $first['id']);
        Notifications::deliver($order->get_id(), $first['id']);
        $this->assertSame(1, $channel->calls);
        $this->assertFalse(wc_get_order($order->get_id())->is_paid());
        $this->assertSame('accepted', get_option('kizlo_pos_delivery_' . $first['id'])['status']);
        Notifications::report('fixture', $first['id'], 'sent', 'fixture-message');
        $this->assertSame('sent', get_option('kizlo_pos_delivery_' . $first['id'])['status']);
        $removed = Notifications::request($order, 'fixture', wp_generate_uuid4());
        remove_all_filters('kizlo_pos_notification_channels');
        Notifications::deliver($order->get_id(), $removed['id']);
        $this->assertSame('failed', wc_get_order($order->get_id())->get_meta('_kizlo_pos_deliveries')[$removed['id']]['status']);
    }

    public function test_existing_locally_formatted_phone_is_matched_without_duplicate_customer(): void
    {
        $id = self::factory()->user->create(['role' => 'customer', 'user_email' => 'existing@example.com']);
        update_user_meta($id, 'billing_phone', '(415) 555-2671');
        update_user_meta($id, 'billing_country', 'US');
        $this->assertSame($id, Customer::resolve(['first_name' => '', 'last_name' => '', 'email' => '', 'phone' => '+14155552671']));
    }

    public function test_shipping_and_tax_use_the_effective_address_and_quoted_rate(): void
    {
        update_option('woocommerce_ship_to_countries', 'all');
        update_option('woocommerce_calc_taxes', 'yes');
        update_option('woocommerce_prices_include_tax', 'no');
        update_option('woocommerce_tax_based_on', 'shipping');
        $zone = new \WC_Shipping_Zone();
        $zone->set_zone_name('POS fixture'); $zone->add_location('US', 'country'); $zone->save();
        $method = $zone->add_shipping_method('flat_rate');
        update_option('woocommerce_flat_rate_' . $method . '_settings', ['enabled' => 'yes', 'title' => 'Fixture delivery', 'cost' => '5', 'tax_status' => 'taxable']);
        \WC_Tax::_insert_tax_rate(['tax_rate_country' => 'US', 'tax_rate_state' => 'CA', 'tax_rate' => '10.0000', 'tax_rate_name' => 'Fixture tax', 'tax_rate_priority' => 1, 'tax_rate_compound' => 0, 'tax_rate_shipping' => 1, 'tax_rate_order' => 0, 'tax_rate_class' => '']);
        \WC_Cache_Helper::get_transient_version('shipping', true);
        \WC_Cache_Helper::invalidate_cache_group('taxes');
        $this->product->set_virtual(false); $this->product->save();
        $response = $this->request('/checkout/quote', 'POST', $this->body());
        $this->assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        $quote = $response->get_data();
        $this->assertSame('500', $quote['rates'][0][0]['cost']);
        $this->assertSame('150', $quote['tax']);
        $this->assertSame('1650', $quote['total']);
        $body = $this->body();
        $body['shipping'] = ['first_name' => 'Test', 'last_name' => 'Customer', 'address_1' => '20 Other Street', 'city' => 'New York', 'country' => 'US', 'state' => 'NY', 'postcode' => '10001'];
        $other = $this->request('/checkout/quote', 'POST', $body);
        $this->assertSame(200, $other->get_status(), wp_json_encode($other->get_data()));
        $this->assertSame('customer', $other->get_data()['sources']['shipping']);
        $this->assertSame('1500', $other->get_data()['total']);
        $body['billing'] = $body['shipping'];
        $sale = $this->request('/checkout', 'POST', $this->cash($body))->get_data();
        $this->assertSame('Test', wc_get_order($sale['order_id'])->get_billing_first_name());
    }

    public function test_authorized_link_grants_only_payment_and_preserves_the_cashier_profile(): void
    {
        $customer = self::factory()->user->create(['role' => 'customer']);
        $order = new \WC_Order(); $order->set_created_via('kizlo-pos'); $order->set_customer_id($customer); $order->set_total(10); $order->set_billing_city('Customer city'); $order->save();
        parse_str(wp_parse_url(PaymentPage::url($order), PHP_URL_QUERY), $query);
        update_user_meta($this->staff, 'billing_city', 'Staff city');
        $session = WC()->session;
        $GLOBALS['wp']->query_vars['order-pay'] = $order->get_id(); $_GET = $query;
        $module = new PaymentPage(); $module->register(); $module->authorize();
        try {
            $this->assertTrue(current_user_can('pay_for_order', $order->get_id()));
            $other = new \WC_Order(); $other->set_customer_id($customer); $other->save();
            $this->assertFalse(current_user_can('pay_for_order', $other->get_id()));
            $this->assertFalse(current_user_can('view_order', $order->get_id()));
            WC()->customer->save();
            $this->assertSame('Staff city', get_user_meta($this->staff, 'billing_city', true));
            $this->assertSame(0, get_current_user_id());
            $this->assertFalse(current_user_can('manage_options'));
        } finally { $module->close(); unset($GLOBALS['wp']->query_vars['order-pay']); }
        $this->assertSame($session, WC()->session);
        $this->assertSame($this->staff, get_current_user_id());
    }

    public function test_invalid_pos_token_blocks_native_pay_post_even_with_a_valid_nonce(): void
    {
        $order = new \WC_Order(); $order->set_created_via('kizlo-pos'); $order->set_total(10); $order->save();
        parse_str(wp_parse_url(PaymentPage::url($order), PHP_URL_QUERY), $query);
        $_GET = array_merge($query, ['pos_payment' => str_repeat('0', 64)]);
        $_POST = ['woocommerce_pay' => '1', 'woocommerce-pay-nonce' => wp_create_nonce('woocommerce-pay')];
        $GLOBALS['wp']->query_vars['order-pay'] = $order->get_id();
        add_filter('wp_die_handler', static fn() => static function ($message) { throw new \RuntimeException($message); });
        try {
            (new PaymentPage())->authorize();
            $this->fail('Invalid link reached native payment processing.');
        } catch (\RuntimeException $error) { $this->assertStringContainsString('invalid or expired', $error->getMessage()); }
        finally { unset($GLOBALS['wp']->query_vars['order-pay']); }
        $this->assertEmpty(wc_get_order($order->get_id())->get_meta('_kizlo_pos_payment_attempt'));
    }

    public function test_an_unknown_gateway_outcome_cannot_launch_another_charge(): void
    {
        $gateway = new class extends \WC_Payment_Gateway {
            public int $calls = 0;
            public function __construct() { $this->id = 'pos_fixture'; $this->enabled = 'yes'; $this->title = 'Fixture'; }
            public function process_payment($order_id) { $this->calls++; return ['result' => 'failure']; }
        };
        add_filter('woocommerce_available_payment_gateways', static fn($gateways) => $gateways + ['pos_fixture' => $gateway], 20);
        $order = new \WC_Order(); $order->set_created_via('kizlo-pos'); $order->add_product($this->product, 1); $order->set_total(10); $order->update_meta_data('_kizlo_pos_online_gateways', ['pos_fixture']); $order->save();
        parse_str(wp_parse_url(PaymentPage::url($order), PHP_URL_QUERY), $query); $_GET = $query;
        $_POST = ['woocommerce_pay' => '1', 'payment_method' => 'pos_fixture', 'woocommerce-pay-nonce' => wp_create_nonce('woocommerce-pay')];
        $GLOBALS['wp']->query_vars['order-pay'] = $order->get_id();
        $module = new PaymentPage(); $module->register(); $module->authorize();
        $_POST['woocommerce-pay-nonce'] = wp_create_nonce('woocommerce-pay');
        try {
            $this->product->set_stock_quantity(0); $this->product->save();
            $module->pay();
            $this->assertSame(0, $gateway->calls);
            $this->assertEmpty(wc_get_order($order->get_id())->get_meta('_kizlo_pos_payment_attempt'));
            $this->product->set_stock_quantity(5); $this->product->save();
            wc_clear_notices();
            $module->pay(); $module->pay();
        }
        finally { $module->close(); unset($GLOBALS['wp']->query_vars['order-pay']); }
        $this->assertSame(1, $gateway->calls);
        $this->assertNotEmpty(wc_get_order($order->get_id())->get_meta('_kizlo_pos_payment_attempt'));
        $this->assertFalse(wc_get_order($order->get_id())->is_paid());
    }

    public function test_native_order_notifications_dispatch_when_email_is_disabled(): void
    {
        $channel = new class implements Channel {
            public function id(): string { return 'order_fixture'; }
            public function label(): string { return 'Order fixture'; }
            public function events(): array { return ['woocommerce_order_status_pending_to_processing']; }
            public function unavailable(\WC_Order $order, string $event): ?string { return null; }
            public function send(\WC_Order $order, string $event, string $delivery_id, array $context): array { return ['status' => 'sent']; }
        };
        add_filter('kizlo_pos_notification_channels', static fn($channels) => [...$channels, $channel]);
        add_filter('woocommerce_email_enabled_customer_processing_order', '__return_false');
        (new Notifications())->bridge();
        $order = new \WC_Order(); $order->set_total(10); $order->save();
        $order->update_status('processing');
        $deliveries = wc_get_order($order->get_id())->get_meta('_kizlo_pos_deliveries');
        $this->assertCount(1, $deliveries);
        $id = array_key_first($deliveries);
        Notifications::deliver($order->get_id(), $id);
        $this->assertSame('sent', get_option('kizlo_pos_delivery_' . $id)['status']);
    }

    public function test_crash_after_order_save_recovers_without_inviting_cash_collection_again(): void
    {
        $body = $this->cash();
        $injected = false;
        add_filter('pre_update_option_' . Sale::option($body['sale_id']), static function ($value) use (&$injected) {
            if (!$injected && $value['state'] === 'created') { $injected = true; throw new \RuntimeException('Injected lost response after save'); }
            return $value;
        });
        $response = $this->request('/checkout', 'POST', $body);
        $this->assertSame(503, $response->get_status());
        $status = $this->request('/checkout/' . $body['sale_id'], 'GET');
        $this->assertSame(200, $status->get_status(), wp_json_encode($status->get_data()));
        $this->assertSame('confirmation_needs_review', $status->get_data()['status']);
        $this->assertFalse($status->get_data()['needs_payment']);
        $this->assertNull($status->get_data()['payment_url']);
        $retry = $this->request('/checkout', 'POST', $body);
        $this->assertSame($status->get_data()['order_id'], $retry->get_data()['order_id']);
        $this->assertFalse($retry->get_data()['paid']);
    }
}
