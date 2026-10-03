<?php

namespace Kizlo\WooCommerce\Modules\Checkout;

use Kizlo\WooCommerce\Modules\Contract\AdditionalFields;
use WC_Order;
use WP_REST_Request;

/** Complete the registered address persistence that CheckoutOrder leaves out in WooCommerce 11.0.1. */
final class AdditionalFieldsModule
{
    public function register(): void
    {
        // Run before the existing native Tax ID projection applies its billing-only cleanup.
        add_action('woocommerce_store_api_checkout_update_order_from_request', [$this, 'persistRetryAddresses'], 5, 2);
    }

    public function persistRetryAddresses(WC_Order $order, WP_REST_Request $request): void
    {
        if ($request->get_method() !== 'POST' || preg_match('#^/wc/store/v1/checkout/\d+$#', $request->get_route()) !== 1) return;

        $registry = AdditionalFields::registry();
        $fields = $registry->get_fields_for_location('address');
        $changed = false;
        foreach (['billing', 'shipping'] as $group) {
            $address = $request->get_param($group . '_address');
            if (!is_array($address)) continue;
            // WooCommerce's public address schema has already validated and sanitized these values.
            // Preserve omission: only fields explicitly submitted belong to this mutation.
            foreach (array_intersect_key($address, $fields) as $key => $value) {
                $changed = true;
                $registry->persist_field_for_order($key, $value, $order, $group, false);
                $registry->persist_field_for_customer($key, $value, WC()->customer, $group);
            }
        }
        if ($changed) WC()->customer->save();
    }
}
