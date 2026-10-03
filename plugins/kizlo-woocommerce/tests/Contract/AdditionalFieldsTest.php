<?php

namespace Kizlo\WooCommerce\Tests\Contract;

use Kizlo\Modules\Introspection\Registry;
use Kizlo\Modules\Introspection\ManagedContent;
use Kizlo\WooCommerce\Modules\Contract\AdditionalFields;
use Kizlo\WooCommerce\Modules\Checkout\AdditionalFieldsModule;
use Kizlo\WooCommerce\Modules\Contract\ContractModule;
use Kizlo\WooCommerce\Modules\Customer\CustomerRepository;
use Kizlo\WooCommerce\Modules\Order\OrderModule;
use Kizlo\WooCommerce\Modules\Storefront\Storefront;
use Kizlo\WooCommerce\Modules\TaxId\TaxIdModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_Customer;
use WC_Order;
use WP_REST_Request;
use WP_REST_Response;

class AdditionalFieldsTest extends TestCase
{
    public function setUp(): void
    {
        parent::setUp();
        if (!isset(AdditionalFields::registry()->get_additional_fields()[TaxIdModule::FIELD_ID])) {
            (new TaxIdModule())->registerCheckoutField();
        }
        foreach ([
            ['id' => 'test/reference', 'location' => 'address', 'type' => 'text'],
            ['id' => 'test/flag', 'location' => 'address', 'type' => 'checkbox'],
            ['id' => 'test/opt-in', 'location' => 'contact', 'type' => 'checkbox'],
            ['id' => 'test/required', 'location' => 'contact', 'type' => 'checkbox', 'required' => true],
            ['id' => 'test/message', 'location' => 'order', 'type' => 'text'],
            ['id' => 'test/slot', 'location' => 'order', 'type' => 'select', 'options' => [
                ['value' => 'morning', 'label' => 'Morning'],
                ['value' => 'afternoon', 'label' => 'Afternoon'],
            ]],
        ] as $field) {
            AdditionalFields::registry()->register_checkout_field(array_merge(['label' => $field['id'], 'required' => false], $field));
        }
    }

    public function tearDown(): void
    {
        foreach (array_keys(AdditionalFields::registry()->get_additional_fields()) as $id) {
            if (str_starts_with($id, 'test/')) AdditionalFields::registry()->deregister_checkout_field($id);
        }
        parent::tearDown();
    }

    public function test_location_schemas_follow_public_definitions_and_submission_semantics(): void
    {
        $address = AdditionalFields::schema('address')['properties'];
        $contact = AdditionalFields::schema('contact')['properties'];
        $order = AdditionalFields::schema('order')['properties'];
        $checkout = AdditionalFields::schema('checkout')['properties'];
        $this->assertArrayHasKey(TaxIdModule::FIELD_ID, $address);
        $this->assertSame('string', $address['test/reference']['type']);
        $this->assertSame('boolean', $address['test/flag']['type']);
        $this->assertSame(['morning', 'afternoon', ''], $order['test/slot']['enum']);
        $this->assertFalse($contact['test/required']['required']);
        $this->assertTrue(AdditionalFields::schema('contact', 'write')['properties']['test/required']['required']);
        $this->assertSame([true], $contact['test/required']['enum']);
        $this->assertArrayNotHasKey('first_name', $address);
        $this->assertArrayNotHasKey('test/opt-in', $address);
        $this->assertArrayNotHasKey('test/message', $contact);
        $this->assertEquals($contact + $order, array_intersect_key($checkout, $contact + $order));
    }

    /**
     * The complete contract materializes lazy schemas for this registration set.
     * Keep that snapshot out of later tests with different registrations.
     *
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function test_contract_keeps_hidden_address_fields_on_both_addresses_and_declares_adapters(): void
    {
        (new ContractModule())->describe();
        $this->bootRestServer();
        ManagedContent::flush();
        $document = Registry::build();
        foreach (AdditionalFields::LOCATIONS as $location) {
            $this->assertArrayHasKey(AdditionalFields::id($location), $document['schemas']);
            $this->assertArrayHasKey(AdditionalFields::id($location, 'write'), $document['schemas']);
        }
        $this->assertArrayHasKey('woocommerce.store.cart', $document['schemas'], wp_json_encode($document['diagnostics']));
        foreach (['billing_address', 'shipping_address'] as $group) {
            $properties = $document['schemas']['woocommerce.store.cart']['properties'][$group]['properties'];
            $this->assertArrayHasKey(TaxIdModule::FIELD_ID, $properties);
            $this->assertArrayHasKey('test/reference', $properties);
        }
        $this->assertSame(AdditionalFields::id('checkout'), $document['schemas']['woocommerce.store.order']['properties']['additional_fields']['$ref']);
        $this->assertSame(AdditionalFields::id('contact'), $document['schemas']['woocommerce.customers']['properties']['additional_fields']['$ref']);
        $metadata = (new Storefront())->build()['address'];
        $this->assertContains('test/reference', $metadata['field_locations']['address']);
        $this->assertContains('test/opt-in', $metadata['field_locations']['contact']);
        $this->assertContains('test/message', $metadata['field_locations']['order']);
    }

    public function test_empty_registry_and_registration_changes_are_rebuilt_without_cached_definitions(): void
    {
        $registry = AdditionalFields::registry();
        $saved = $registry->get_additional_fields();
        try {
            foreach (array_keys($saved) as $id) $registry->deregister_checkout_field($id);
            foreach (AdditionalFields::LOCATIONS as $location) {
                $this->assertSame([], AdditionalFields::schema($location)['properties']);
                $this->assertFalse(AdditionalFields::schema($location)['additionalProperties']);
            }
            AdditionalFields::registry()->register_checkout_field(['id' => 'test/changed', 'label' => 'Changed', 'location' => 'contact', 'type' => 'text']);
            $this->assertSame('string', AdditionalFields::schema('contact')['properties']['test/changed']['type']);
            $registry->deregister_checkout_field('test/changed');
            AdditionalFields::registry()->register_checkout_field(['id' => 'test/changed', 'label' => 'Changed', 'location' => 'order', 'type' => 'checkbox']);
            $this->assertSame([], AdditionalFields::schema('contact')['properties']);
            $this->assertSame('boolean', AdditionalFields::schema('order')['properties']['test/changed']['type']);
        } finally {
            $registry->deregister_checkout_field('test/changed');
            foreach ($saved as $field) $registry->register_checkout_field($field);
        }
    }

    public function test_saved_values_keep_groups_and_customer_order_boundaries(): void
    {
        $registry = AdditionalFields::registry();
        $user = self::factory()->user->create(['role' => 'customer']);
        $customer = new WC_Customer($user);
        foreach (['billing' => 'BILL', 'shipping' => 'SHIP'] as $group => $value) {
            $registry->persist_field_for_customer('test/reference', $value, $customer, $group);
            $registry->persist_field_for_customer('test/flag', false, $customer, $group);
        }
        $registry->persist_field_for_customer('test/opt-in', false, $customer, 'other');
        // Simulate legacy polluted metadata: the adapter must still exclude order-only keys.
        $registry->persist_field_for_customer('test/message', 'private order note', $customer, 'other');
        $customer->save();
        $this->assertSame('BILL', $registry->get_field_from_object('test/reference', new WC_Customer($user), 'billing'));
        $data = (new CustomerRepository())->extendCustomer(['billing' => [], 'shipping' => []], get_userdata($user));
        $this->assertSame('BILL', ((array) $data['billing']['additional_fields'])['test/reference']);
        $this->assertSame('SHIP', ((array) $data['shipping']['additional_fields'])['test/reference']);
        $this->assertFalse(((array) $data['billing']['additional_fields'])['test/flag']);
        $this->assertSame(['test/opt-in' => false], (array) $data['additional_fields']);

        $order = new WC_Order();
        $order->set_customer_id($user);
        $order->save();
        $registry->persist_field_for_order('test/message', '', $order, 'other', false);
        $registry->persist_field_for_order('test/opt-in', false, $order, 'other', false);
        $order->save();
        $request = new WP_REST_Request('GET', '/wc/store/v1/order/' . $order->get_id());
        $response = (new OrderModule())->extendStoreOrderItems(new WP_REST_Response(['items' => []]), null, $request);
        $this->assertSame('', ((array) $response->get_data()['additional_fields'])['test/message']);
        $this->assertFalse(((array) $response->get_data()['additional_fields'])['test/opt-in']);
    }

    public function test_retry_address_adapter_persists_only_submitted_registered_keys(): void
    {
        $user = self::factory()->user->create(['role' => 'customer']);
        WC()->customer = new WC_Customer($user);
        $order = new WC_Order();
        $order->set_customer_id($user);
        $order->save();
        $registry = AdditionalFields::registry();
        $registry->persist_field_for_order('test/reference', 'existing shipping', $order, 'shipping', false);
        $request = new WP_REST_Request('POST', '/wc/store/v1/checkout/' . $order->get_id());
        $request->set_param('billing_address', ['test/reference' => '', 'test/flag' => false, 'test/opt-in' => true]);
        (new AdditionalFieldsModule())->persistRetryAddresses($order, $request);
        $order->save();
        $this->assertSame('', $registry->get_field_from_object('test/reference', wc_get_order($order->get_id()), 'billing'));
        $this->assertFalse($registry->get_field_from_object('test/flag', wc_get_order($order->get_id()), 'billing'));
        $this->assertSame('existing shipping', $registry->get_field_from_object('test/reference', wc_get_order($order->get_id()), 'shipping'));
        $this->assertFalse($registry->get_field_from_object('test/opt-in', wc_get_order($order->get_id()), 'billing'));
        $this->assertFalse(wc_get_order($order->get_id())->meta_exists('_wc_billing/test/opt-in'));
    }
}
