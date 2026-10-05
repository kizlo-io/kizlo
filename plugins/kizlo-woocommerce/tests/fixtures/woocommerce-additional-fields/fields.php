<?php
/**
 * Plugin Name: WooCommerce additional fields test fixture
 * Description: Third-party registrations for the seeded contract and SDK integration tests only.
 */
add_action('woocommerce_init', static function (): void {
    foreach ([
        ['id' => 'qa/reference', 'location' => 'address', 'type' => 'text'],
        ['id' => 'qa/address-flag', 'location' => 'address', 'type' => 'checkbox'],
        ['id' => 'qa/opt-in', 'location' => 'contact', 'type' => 'checkbox'],
        ['id' => 'qa/message', 'location' => 'order', 'type' => 'text'],
        ['id' => 'qa/slot', 'location' => 'order', 'type' => 'select', 'options' => [
            ['value' => 'morning', 'label' => 'Morning'],
            ['value' => 'afternoon', 'label' => 'Afternoon'],
        ]],
    ] as $field) {
        woocommerce_register_additional_checkout_field(array_merge(['label' => $field['id'], 'required' => false], $field));
    }

    woocommerce_register_additional_checkout_field([
        'id' => 'qa/pickup-reference', 'label' => 'Pickup reference', 'location' => 'order', 'type' => 'text',
        'required' => [
            'cart' => ['properties' => [
                'prefers_collection' => ['const' => true],
                'extensions' => ['properties' => [
                    'qaConditions' => ['properties' => ['reference.required' => ['const' => true]], 'required' => ['reference.required']],
                ], 'required' => ['qaConditions']],
            ], 'required' => ['prefers_collection', 'extensions']],
        ],
    ]);

    woocommerce_store_api_register_endpoint_data([
        'endpoint' => \Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema::IDENTIFIER,
        'namespace' => 'qaConditions',
        'data_callback' => static fn(): array => ['reference.required' => true],
        'schema_callback' => static fn(): array => ['reference.required' => ['type' => 'boolean', 'readonly' => true]],
        'schema_type' => ARRAY_A,
    ]);
});

// Available to every seeded package without changing a store's shipping zones.
add_filter('woocommerce_shipping_methods', static function (array $methods): array {
    $methods['qa_pickup'] = new class extends WC_Shipping_Method {
        public function __construct()
        {
            $this->id = 'qa_pickup';
            $this->method_title = 'Fixture pickup';
            $this->supports = ['local-pickup'];
        }
    };
    return $methods;
});

add_filter('woocommerce_package_rates', static function (array $rates, array $package): array {
    if (($package['destination']['country'] ?? '') === 'US') {
        $rates['qa_pickup:fixture'] = new WC_Shipping_Rate('qa_pickup:fixture', 'Fixture pickup', 0, [], 'qa_pickup');
    }
    return $rates;
}, 10, 2);
