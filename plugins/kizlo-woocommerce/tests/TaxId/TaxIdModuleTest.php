<?php

namespace Kizlo\WooCommerce\Tests\TaxId;

use Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields;
use Automattic\WooCommerce\Blocks\Package;
use Kizlo\WooCommerce\Modules\TaxId\TaxIdModule;
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

        $response = $this->module->prepareCustomer(
            new WP_REST_Response(['billing' => []]),
            get_userdata($userId)
        );
        $this->assertInstanceOf(WP_REST_Response::class, $response);
        $this->assertSame('GB-42', $response->get_data()['billing']['tax_id']);

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

    private function reregisterField(): void
    {
        $this->checkoutFields->deregister_checkout_field(TaxIdModule::FIELD_ID);
        $this->module->registerCheckoutField();
    }
}
