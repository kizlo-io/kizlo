<?php

namespace Kizlo\Pos\Modules\Checkout;

use Kizlo\Pos\Modules\Settings\Settings;

final class Calculator
{
    public static function product(int $id): \WC_Product
    {
        $product = wc_get_product($id);
        $parent = $product && $product->is_type('variation') ? wc_get_product($product->get_parent_id()) : $product;
        if (!$product || !$parent || $product->get_status() !== 'publish' || $parent->get_status() !== 'publish' ||
            !current_user_can('read_product', $id) || get_post_field('post_password', $parent->get_id()) !== '' ||
            !$product->is_type(['simple', 'variation']) || !$product->is_purchasable()) {
            throw new CheckoutError('This item is not available for sale. Choose a published simple product or variation.', 409);
        }
        return $product;
    }

    public static function money(mixed $amount): string
    {
        return (string) wc_add_number_precision((float) $amount);
    }

    public static function products(array $items): array
    {
        $products = [];
        $stock = [];
        foreach ($items as $id => $quantity) {
            $product = self::product((int) $id);
            if ($product->is_sold_individually() && $quantity !== 1) throw new CheckoutError($product->get_name() . ' is sold individually.', 409);
            if (!$product->is_in_stock() || !$product->has_enough_stock($quantity)) throw new CheckoutError($product->get_name() . ' has insufficient stock.', 409);
            $stockId = $product->get_stock_managed_by_id();
            $stock[$stockId] = ($stock[$stockId] ?? 0) + $quantity;
            $products[$id] = $product;
        }
        foreach ($stock as $id => $quantity) {
            $product = wc_get_product($id);
            if ($product && $product->managing_stock() && !$product->backorders_allowed() && (int) $product->get_stock_quantity() - wc_get_held_stock_quantity($product) < $quantity) throw new CheckoutError('Stock changed. Review the cart before collecting payment.', 409);
        }
        return $products;
    }

    public static function run(array $input, callable $operation): mixed
    {
        $context = new Context(array_merge($input['addresses']['billing'], $input['contact']), $input['addresses']['shipping']);
        try {
            $contents = [];
            foreach (self::products($input['items']) as $id => $product) {
                $quantity = $input['items'][$id];
                $key = WC()->cart->generate_cart_id($id);
                $contents[$key] = ['key' => $key, 'product_id' => $product->is_type('variation') ? $product->get_parent_id() : $id,
                    'variation_id' => $product->is_type('variation') ? $id : 0,
                    'variation' => $product instanceof \WC_Product_Variation ? $product->get_variation_attributes() : [],
                    'quantity' => $quantity, 'data' => $product, 'data_hash' => wc_get_cart_item_data_hash($product)];
            }
            WC()->cart->set_cart_contents($contents);
            $requiresShipping = wc_shipping_enabled() && (bool) array_filter($contents, static fn($line) => $line['data']->needs_shipping());
            if ($requiresShipping && wc_get_shipping_method_count(true) === 0) throw new CheckoutError('Configure an enabled shipping method for physical POS items before collecting payment.', 409);
            WC()->session->set('chosen_shipping_methods', array_values($input['rates']));
            WC()->cart->calculate_totals();
            $packages = WC()->shipping()->get_packages();
            if ($requiresShipping && !$packages) throw new CheckoutError('Shipping could not be calculated for this destination.', 409);
            $chosen = WC()->session->get('chosen_shipping_methods', []);
            $rates = [];
            $selectionChanged = false;
            foreach ($packages as $index => $package) {
                if (empty($package['rates'])) throw new CheckoutError('No shipping rate is available for this destination. Check store address and shipping zones.', 409);
                if (isset($input['rates'][$index]) && !isset($package['rates'][$input['rates'][$index]])) throw new CheckoutError('Shipping selection changed. Reset shipping options and review again.', 409);
                if (!isset($package['rates'][$chosen[$index] ?? ''])) {
                    $chosen[$index] = wc_get_default_shipping_method_for_package($index, $package, '');
                    if (!isset($package['rates'][$chosen[$index]])) throw new CheckoutError('Choose an available shipping method.', 409);
                    $selectionChanged = true;
                }
                foreach ($package['rates'] as $rate) $rates[$index][] = ['id' => $rate->get_id(), 'label' => $rate->get_label(), 'cost' => self::money($rate->get_cost())];
            }
            if ($selectionChanged) {
                WC()->session->set('chosen_shipping_methods', $chosen);
                WC()->cart->calculate_totals();
            }
            $gateways = WC()->payment_gateways()->get_available_payment_gateways();
            $online = array_values(array_filter(array_keys($gateways), static fn($id) => !in_array($id, ['cod', 'bacs', 'cheque'], true)));
            $online = array_values(array_intersect($online, (array) apply_filters('kizlo_pos_online_gateways', $online)));
            $lines = [];
            foreach (WC()->cart->get_cart() as $item) $lines[] = ['id' => $item['variation_id'] ?: $item['product_id'], 'name' => $item['data']->get_name(),
                'quantity' => $item['quantity'], 'total' => self::money($item['line_total'] + $item['line_tax'])];
            $quote = ['items' => $lines, 'currency' => get_woocommerce_currency(), 'decimals' => wc_get_price_decimals(),
                'total' => self::money(WC()->cart->get_total('edit')), 'tax' => self::money(WC()->cart->get_total_tax()),
                'shipping_total' => self::money(WC()->cart->get_shipping_total() + WC()->cart->get_shipping_tax()),
                'addresses' => $input['addresses'], 'sources' => $input['sources'], 'rates' => $rates, 'chosen_rates' => $chosen,
                'cash' => isset($gateways['cod']), 'online' => $online];
            $quote['fingerprint'] = hash_hmac('sha256', wp_json_encode([$input, $quote, Settings::checkoutFields(), Settings::handoff()]), wp_salt('nonce'));
            return $operation($quote);
        } finally { $context->close(); }
    }
}
