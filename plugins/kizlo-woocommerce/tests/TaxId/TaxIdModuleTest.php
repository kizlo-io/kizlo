<?php

namespace Kizlo\WooCommerce\Tests\TaxId;

use Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields;
use Automattic\WooCommerce\Blocks\Package;
use Automattic\WooCommerce\StoreApi\SchemaController;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Kizlo\WooCommerce\Modules\TaxId\TaxIdModule;
use Kizlo\WooCommerce\Modules\Customer\CustomerModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_Customer;
use WC_Order;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

class TaxIdModuleTest extends TestCase
{
    private CheckoutFields $checkoutFields;
    private TaxIdModule $module;

    public function setUp(): void
    {
        parent::setUp();

        $this->checkoutFields = Package::container()->get(CheckoutFields::class);
        $this->module         = new TaxIdModule();
        update_option(TaxIdModule::SETTING_ID, 'no');
        $this->reregisterField();
    }

    public function tearDown(): void
    {
        update_option(TaxIdModule::SETTING_ID, 'no');
        $this->reregisterField();

        parent::tearDown();
    }

    public function test_registers_a_sanitized_billing_address_field_that_is_optional_by_default(): void
    {
        $field = $this->checkoutFields->get_additional_fields()[TaxIdModule::FIELD_ID] ?? null;

        $this->assertIsArray($field);
        $this->assertSame('address', $field['location']);
        $this->assertSame('text', $field['type']);
        $this->assertFalse($field['required']);
        $this->assertSame([
            'customer' => [
                'properties' => [
                    'address' => [
                        'not' => [
                            'required' => ['email'],
                        ],
                    ],
                ],
            ],
        ], $field['hidden']);
        $this->assertSame('GB 42', $this->checkoutFields->sanitize_field(TaxIdModule::FIELD_ID, '  <b>GB 42</b>  '));
    }

    public function test_enabled_setting_registers_the_billing_context_requirement(): void
    {
        update_option(TaxIdModule::SETTING_ID, 'yes');
        $this->reregisterField();

        $field = $this->checkoutFields->get_additional_fields()[TaxIdModule::FIELD_ID];

        $this->assertSame([
            'customer' => [
                'properties' => [
                    'address' => ['required' => ['email']],
                ],
            ],
        ], $field['required']);
    }

    public function test_adds_the_disabled_by_default_setting_to_the_checkout_group(): void
    {
        $settings = $this->module->addRequirementSetting([
            ['id' => 'woocommerce_enable_guest_checkout'],
            ['id' => 'woocommerce_enable_checkout_login_reminder'],
        ]);

        $this->assertSame([
            'woocommerce_enable_guest_checkout',
            TaxIdModule::SETTING_ID,
            'woocommerce_enable_checkout_login_reminder',
        ], array_column($settings, 'id'));
        $this->assertSame('no', $settings[1]['default']);
        $this->assertSame('Require Tax ID at checkout', $settings[1]['desc']);
        $this->assertSame('no', get_option(TaxIdModule::SETTING_ID, 'no'));
    }

    public function test_customer_admin_and_rest_response_use_the_canonical_billing_value(): void
    {
        $userId   = self::factory()->user->create(['role' => 'customer']);
        $customer = new WC_Customer($userId);
        $this->checkoutFields->persist_field_for_customer(TaxIdModule::FIELD_ID, 'GB-42', $customer, 'billing');
        $customer->save();
        update_user_meta($userId, TaxIdModule::SHIPPING_META_KEY, 'shipping-copy');

        $fields = $this->module->addCustomerBillingField(['billing' => ['fields' => []]]);
        $this->assertArrayHasKey(TaxIdModule::BILLING_META_KEY, $fields['billing']['fields']);

        $response = (new CustomerModule())->prepareCustomerCallback(
            new WP_REST_Response(['billing' => [], 'shipping' => []]),
            get_userdata($userId)
        );
        $this->assertInstanceOf(WP_REST_Response::class, $response);
        $this->assertSame('GB-42', ((array) $response->get_data()['billing']['additional_fields'])[TaxIdModule::FIELD_ID]);
        $this->assertArrayNotHasKey('tax_id', $response->get_data()['billing']);

        $this->module->removeCustomerShippingCopy($userId);
        $this->assertSame('', get_user_meta($userId, TaxIdModule::SHIPPING_META_KEY, true));
        $this->assertSame('GB-42', get_user_meta($userId, TaxIdModule::BILLING_META_KEY, true));
    }

    /** @dataProvider orderOrigins */
    public function test_order_editor_shows_one_billing_field_for_every_order_origin(string $createdVia): void
    {
        $order = new WC_Order();
        $order->set_created_via($createdVia);
        $order->save();
        $this->checkoutFields->persist_field_for_order(TaxIdModule::FIELD_ID, 'GB-42', $order, 'billing', false);
        $order->save();

        // Simulate WooCommerce having already injected the Store API field.
        $fields = $this->module->addOrderBillingField([
            'state' => ['label' => 'State'],
            TaxIdModule::FIELD_ID => ['id' => TaxIdModule::BILLING_META_KEY, 'label' => 'Tax ID'],
        ], $order, 'edit');

        $taxFields = array_filter(
            $fields,
            static fn(array $field): bool => ($field['id'] ?? null) === TaxIdModule::BILLING_META_KEY
        );

        $this->assertCount(1, $taxFields);
        $this->assertSame('GB-42', reset($taxFields)['value']);
        $this->assertSame([], $this->module->removeOrderShippingField([
            TaxIdModule::FIELD_ID => ['id' => TaxIdModule::SHIPPING_META_KEY],
        ]));
    }

    /** @return array<string, array{string}> */
    public function orderOrigins(): array
    {
        return [
            'store api' => ['store-api'],
            'manual'    => ['admin'],
            'older'     => ['checkout'],
        ];
    }

    public function test_order_editor_can_set_replace_and_clear_without_changing_the_customer(): void
    {
        $userId   = self::factory()->user->create(['role' => 'customer']);
        $customer = new WC_Customer($userId);
        $this->checkoutFields->persist_field_for_customer(TaxIdModule::FIELD_ID, 'CUSTOMER', $customer, 'billing');
        $customer->save();

        $order = new WC_Order();
        $order->set_customer_id($userId);
        $order->save();

        foreach (['ORDER-1', 'ORDER-2', ''] as $value) {
            $this->module->updateOrderTaxId(TaxIdModule::BILLING_META_KEY, $value, $order);
            $order->save();
            $order = wc_get_order($order->get_id());

            $this->assertSame($value, $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, $order, 'billing'));
            $this->assertSame('CUSTOMER', get_user_meta($userId, TaxIdModule::BILLING_META_KEY, true));
        }
    }

    /** @dataProvider invalidTaxIds */
    public function test_retry_guard_rejects_invalid_billing_tax_ids_before_the_callback(mixed $value): void
    {
        update_option(TaxIdModule::SETTING_ID, 'yes');
        $request = new WP_REST_Request('POST', '/wc/store/v1/checkout/42');
        $request->set_param('billing_address', $value === null ? [] : [TaxIdModule::FIELD_ID => $value]);

        $result = $this->module->validateRetryTaxId(null, null, $request);

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame('rest_invalid_param', $result->get_error_code());
        $this->assertSame(400, $result->get_error_data()['status']);
        $this->assertSame('Tax ID is required.', $result->get_error_data()['params']['billing_address']);
        $this->assertSame('Tax ID is required.', $result->get_error_data()['details']['billing_address']['message']);
    }

    /** @return array<string, array{mixed}> */
    public function invalidTaxIds(): array
    {
        return [
            'missing'    => [null],
            'empty'      => [''],
            'whitespace' => [" \t\n "],
        ];
    }

    public function test_retry_guard_accepts_disabled_and_populated_requests_without_shipping_tax_id(): void
    {
        $request = new WP_REST_Request('POST', '/wc/store/v1/checkout/42');
        $request->set_param('billing_address', []);
        $request->set_param('shipping_address', []);

        $marker = new WP_REST_Response();
        $this->assertSame($marker, $this->module->validateRetryTaxId($marker, null, $request));

        update_option(TaxIdModule::SETTING_ID, 'yes');
        $request->set_param('billing_address', [TaxIdModule::FIELD_ID => ' GB-42 ']);
        $this->assertSame($marker, $this->module->validateRetryTaxId($marker, null, $request));
    }

    public function test_retry_persists_the_billing_value_on_the_order_and_customer_only(): void
    {
        $userId   = self::factory()->user->create(['role' => 'customer']);
        $customer = new WC_Customer($userId);
        WC()->customer = $customer;

        $order = new WC_Order();
        $order->set_customer_id($userId);
        $order->save();

        $request = new WP_REST_Request('POST', '/wc/store/v1/checkout/' . $order->get_id());
        $request->set_param('billing_address', [TaxIdModule::FIELD_ID => ' <b>GB-42</b> ']);

        $this->module->persistRetryTaxId($order, $request);
        $order->save();

        $this->assertSame('GB-42', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, $order, 'billing'));
        $this->assertSame('', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, $order, 'shipping'));

        $customer = new WC_Customer($userId);
        $this->assertSame('GB-42', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, $customer, 'billing'));
        $this->assertSame('', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, $customer, 'shipping'));
    }

    public function test_profile_edits_and_retry_omission_and_clearing_read_the_same_managed_value(): void
    {
        $userId = self::factory()->user->create(['role' => 'customer']);
        // The WordPress customer editor saves the managed meta control before its update action.
        update_user_meta($userId, TaxIdModule::BILLING_META_KEY, 'PROFILE-EDIT');
        update_user_meta($userId, TaxIdModule::SHIPPING_META_KEY, 'shipping-copy');
        $this->module->removeCustomerShippingCopy($userId);
        $customer = new WC_Customer($userId);
        WC()->customer = $customer;
        $order = new WC_Order();
        $order->set_customer_id($userId);
        $order->save();
        $this->checkoutFields->persist_field_for_order(TaxIdModule::FIELD_ID, 'ORDER-SNAPSHOT', $order, 'billing', false);
        $order->save();
        $request = new WP_REST_Request('POST', '/wc/store/v1/checkout/' . $order->get_id());
        $request->set_param('billing_address', ['city' => 'London']);
        $this->module->persistRetryTaxId($order, $request);
        $this->assertSame('ORDER-SNAPSHOT', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, $order, 'billing'));
        $this->assertSame('PROFILE-EDIT', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, new WC_Customer($userId), 'billing'));
        $request->set_param('billing_address', [TaxIdModule::FIELD_ID => '']);
        $this->module->persistRetryTaxId($order, $request);
        $order->save();
        $this->assertSame('', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, wc_get_order($order->get_id()), 'billing'));
        $response = (new CustomerModule())->prepareCustomerCallback(new WP_REST_Response(['billing' => [], 'shipping' => []]), get_userdata($userId));
        $this->assertSame('', ((array) $response->get_data()['billing']['additional_fields'])[TaxIdModule::FIELD_ID]);
        $this->assertArrayNotHasKey('tax_id', $response->get_data()['billing']);
    }

    public function test_shipping_copy_cleanup_preserves_billing_and_does_not_run_after_failed_requests(): void
    {
        $userId = self::factory()->user->create(['role' => 'customer']);
        $customer = new WC_Customer($userId);
        WC()->customer = $customer;
        $order = new WC_Order();
        $order->set_customer_id($userId);
        $order->save();
        $this->checkoutFields->persist_field_for_customer(TaxIdModule::FIELD_ID, 'PROFILE', $customer, 'billing');
        $this->checkoutFields->persist_field_for_customer(TaxIdModule::FIELD_ID, 'COPY', $customer, 'shipping');
        $customer->save();
        $this->checkoutFields->persist_field_for_order(TaxIdModule::FIELD_ID, 'ORDER', $order, 'billing', false);
        $this->checkoutFields->persist_field_for_order(TaxIdModule::FIELD_ID, 'COPY', $order, 'shipping', false);
        $order->save();
        $request = new WP_REST_Request('POST', '/wc/store/v1/checkout/' . $order->get_id());
        $failed = new WP_REST_Response(['order_id' => $order->get_id()], 400);
        $this->module->removeStoreApiShippingCopies($failed, null, $request);
        $this->assertSame('COPY', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, new WC_Customer($userId), 'shipping'));
        $success = new WP_REST_Response(['order_id' => $order->get_id()]);
        $this->module->removeStoreApiShippingCopies($success, null, $request);
        $this->assertSame('', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, new WC_Customer($userId), 'shipping'));
        $this->assertSame('', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, wc_get_order($order->get_id()), 'shipping'));
        $this->assertSame('PROFILE', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, new WC_Customer($userId), 'billing'));
        $this->assertSame('ORDER', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, wc_get_order($order->get_id()), 'billing'));
    }

    public function test_profile_editor_value_preloads_the_public_cart_billing_schema_and_order_stays_independent(): void
    {
        $userId = self::factory()->user->create(['role' => 'customer']);
        update_user_meta($userId, TaxIdModule::BILLING_META_KEY, 'PROFILE-EDIT');
        $schema = StoreApi::container()->get(SchemaController::class)->get('billing-address');
        $this->assertSame('PROFILE-EDIT', $schema->get_item_response(new WC_Customer($userId))[TaxIdModule::FIELD_ID]);
        $order = new WC_Order();
        $order->set_customer_id($userId);
        $order->save();
        foreach (['ORDER-1', 'ORDER-2', ''] as $value) {
            $this->module->updateOrderTaxId(TaxIdModule::BILLING_META_KEY, $value, $order);
            $order->save();
            $this->assertSame($value, $schema->get_item_response(wc_get_order($order->get_id()))[TaxIdModule::FIELD_ID]);
            $this->assertSame('PROFILE-EDIT', $schema->get_item_response(new WC_Customer($userId))[TaxIdModule::FIELD_ID]);
        }
    }

    public function test_invalid_retry_dispatch_stops_before_mutation_or_payment(): void
    {
        $userId = self::factory()->user->create(['role' => 'customer']);
        $customer = new WC_Customer($userId);
        $this->checkoutFields->persist_field_for_customer(TaxIdModule::FIELD_ID, 'PROFILE-BEFORE', $customer, 'billing');
        $customer->save();
        $order = new WC_Order();
        $order->set_customer_id($userId);
        $order->set_status('pending');
        $order->save();
        $this->checkoutFields->persist_field_for_order(TaxIdModule::FIELD_ID, 'ORDER-BEFORE', $order, 'billing', false);
        $order->save();
        update_option(TaxIdModule::SETTING_ID, 'yes');
        $paymentCalls = 0;
        $this->bootRestServer();
        // Replace the retry callback only: the real REST pre-callback filters still run.
        register_rest_route('wc/store/v1', '/checkout/(?P<id>[\\d]+)', [
            'methods' => 'POST',
            'permission_callback' => '__return_true',
            'callback' => function (WP_REST_Request $request) use ($order, &$paymentCalls): WP_REST_Response {
                $this->module->persistRetryTaxId($order, $request);
                $order->save();
                ++$paymentCalls;
                return new WP_REST_Response();
            },
        ], true);
        $adminId = self::factory()->user->create(['role' => 'administrator']);
        $originalUser = get_current_user_id();
        wp_set_current_user($adminId);
        $GLOBALS['wp_rest_application_password_uuid'] = 'test-application-password';
        add_filter('rest_request_before_callbacks', [$this->module, 'validateRetryTaxId'], 20, 3);
        try {
            $request = new WP_REST_Request('POST', '/wc/store/v1/checkout/' . $order->get_id());
            $request->set_param('billing_address', [TaxIdModule::FIELD_ID => '']);
            $response = rest_get_server()->dispatch($request);
            $this->assertSame(400, $response->get_status());
            $this->assertSame('rest_invalid_param', $response->get_data()['code']);
            $this->assertSame(0, $paymentCalls);
            $this->assertSame('pending', wc_get_order($order->get_id())->get_status());
            $this->assertSame('ORDER-BEFORE', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, wc_get_order($order->get_id()), 'billing'));
            $this->assertSame('PROFILE-BEFORE', $this->checkoutFields->get_field_from_object(TaxIdModule::FIELD_ID, new WC_Customer($userId), 'billing'));
        } finally {
            remove_filter('rest_request_before_callbacks', [$this->module, 'validateRetryTaxId'], 20);
            unset($GLOBALS['wp_rest_application_password_uuid']);
            wp_set_current_user($originalUser);
        }
    }

    private function reregisterField(): void
    {
        $this->checkoutFields->deregister_checkout_field(TaxIdModule::FIELD_ID);
        $this->module->registerCheckoutField();
    }
}
