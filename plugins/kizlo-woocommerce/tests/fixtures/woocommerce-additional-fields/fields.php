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
});
