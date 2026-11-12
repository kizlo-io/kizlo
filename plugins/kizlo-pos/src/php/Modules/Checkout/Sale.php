<?php

namespace Kizlo\Pos\Modules\Checkout;

use Kizlo\Pos\Support\Lock;

final class Sale
{
    public static function option(string $id): string { return 'kizlo_pos_sale_' . $id; }

    public static function read(string $id): array
    {
        $key = self::option($id);
        wp_cache_delete($key, 'options');
        $sale = get_option($key, []);
        if (!$sale || (int) $sale['actor'] !== get_current_user_id()) throw new CheckoutError('Sale not found for this staff account.', 404);
        return $sale;
    }

    public static function order(string $id): \WC_Order
    {
        $sale = self::read($id);
        $order = !empty($sale['order_id']) ? wc_get_order($sale['order_id']) : false;
        if (!$order) {
            $query = \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled()
                ? ['meta_query' => [['key' => '_kizlo_pos_sale_id', 'value' => $id]]]
                : ['meta_key' => '_kizlo_pos_sale_id', 'meta_value' => $id];
            $orders = wc_get_orders(['limit' => 2] + $query);
            if (count($orders) === 1 && $orders[0]->get_meta('_kizlo_pos_sale_id') === $id) $order = $orders[0];
        }
        if (!$order || $order->get_meta('_kizlo_pos_sale_id') !== $id) throw new CheckoutError('Sale outcome is uncertain. Check WooCommerce orders before retrying or starting another sale.', 409, ['uncertain' => true]);
        return $order;
    }

    public static function status(string $id): array
    {
        $order = self::order($id);
        $paid = $order->is_paid() && (bool) $order->get_date_paid();
        $ready = $order->get_meta('_kizlo_pos_ready') === 'yes';
        $online = $order->get_meta('_kizlo_pos_method') === 'online';
        return ['sale_id' => $id, 'order_id' => $order->get_id(), 'status' => !$paid && (!$ready || !$online) ? 'confirmation_needs_review' : $order->get_status(), 'paid' => $paid,
            'needs_payment' => $ready && $online && $order->needs_payment(), 'payment_url' => $ready && $online && $order->needs_payment() ? PaymentPage::url($order) : null,
            'total' => Calculator::money($order->get_total()), 'currency' => $order->get_currency(), 'decimals' => wc_get_price_decimals(),
            'admin_url' => $order->get_edit_order_url(), 'deliveries' => $order->get_meta('_kizlo_pos_deliveries') ?: [],
            'channels' => \Kizlo\Pos\Modules\Notification\Notifications::catalog($order),
            'billing_email' => $order->get_billing_email(), 'billing_phone' => $order->get_billing_phone()];
    }

    public static function commit(array $body): array
    {
        $id = Input::uuid($body['sale_id'] ?? null);
        $hash = hash_hmac('sha256', wp_json_encode($body), wp_salt('nonce'));
        return Lock::run('sale:' . $id, static function () use ($id, $body, $hash): array {
            $key = self::option($id);
            wp_cache_delete($key, 'options');
            if (get_option($key)) {
                $saved = self::read($id);
                if (!hash_equals($saved['hash'], $hash)) throw new CheckoutError('This sale was already submitted with different details. Recover its status first.', 409);
                return self::status($id);
            }
            $input = Input::checkout($body);
            if (!in_array($body['method'] ?? null, ['cash', 'online'], true)) throw new CheckoutError('Choose cash or online payment.');
            return Lock::run('inventory', static function () use ($id, $key, $hash, $input, $body): array {
                return Calculator::run($input, static function (array $quote) use ($id, $key, $hash, $input, $body): array {
                    if (!is_string($body['fingerprint'] ?? null) || !hash_equals($quote['fingerprint'], $body['fingerprint'])) throw new CheckoutError('Prices, stock, shipping or settings changed. Review the sale again.', 409, ['quote' => $quote]);
                    if ($body['method'] === 'cash' && !$quote['cash']) throw new CheckoutError('Cash on delivery is not available. Check WooCommerce payment settings.', 409);
                    $handoff = \Kizlo\Pos\Modules\Settings\Settings::handoff();
                    if ($body['method'] === 'online' && (!$quote['online'] || (!$handoff['device'] && !$handoff['send']))) throw new CheckoutError('Online payment is unavailable for this sale.', 409);
                    $customerId = Customer::resolve($input['contact']);
                    $reservation = ['actor' => get_current_user_id(), 'hash' => $hash, 'state' => 'creating', 'created' => time()];
                    if (!add_option($key, $reservation, '', false)) throw new CheckoutError('Sale already exists. Recover its status.', 409);
                    $order = new \WC_Order();
                    $order->set_created_via('kizlo-pos');
                    $order->set_status('pending');
                    $order->set_customer_id($customerId);
                    $order->set_currency(get_woocommerce_currency());
                    $order->set_prices_include_tax(wc_prices_include_tax());
                    $order->set_address(array_merge($input['addresses']['billing'], array_filter($input['contact'], static fn($value) => $value !== '')), 'billing');
                    $order->set_address($input['addresses']['shipping'], 'shipping');
                    $order->set_cart_hash(WC()->cart->get_cart_hash());
                    $order->set_shipping_total(wc_format_decimal(WC()->cart->get_shipping_total()));
                    $order->set_discount_total(wc_format_decimal(WC()->cart->get_discount_total()));
                    $order->set_discount_tax(wc_format_decimal(WC()->cart->get_discount_tax()));
                    $order->set_cart_tax(wc_format_decimal(WC()->cart->get_cart_contents_tax() + WC()->cart->get_fee_tax()));
                    $order->set_shipping_tax(wc_format_decimal(WC()->cart->get_shipping_tax()));
                    $order->set_total(WC()->cart->get_total('edit'));
                    $order->add_meta_data('_kizlo_pos_sale_id', $id, true);
                    $order->add_meta_data('_kizlo_pos_actor', (string) get_current_user_id(), true);
                    $order->add_meta_data('_kizlo_pos_method', $body['method'], true);
                    $order->add_meta_data('_kizlo_pos_address_sources', $input['sources'], true);
                    $order->add_meta_data('_kizlo_pos_online_gateways', $quote['online'], true);
                    $checkout = WC()->checkout();
                    $checkout->create_order_line_items($order, WC()->cart);
                    $checkout->create_order_fee_lines($order, WC()->cart);
                    $checkout->create_order_shipping_lines($order, $quote['chosen_rates'], WC()->shipping()->get_packages());
                    $checkout->create_order_tax_lines($order, WC()->cart);
                    $order->save();
                    $reservation['order_id'] = $order->get_id();
                    $reservation['state'] = 'created';
                    update_option($key, $reservation, false);
                    try { wc_reserve_stock_for_order($order); }
                    catch (\Exception $error) {
                        $order->update_status('cancelled', 'POS stock reservation failed.');
                        throw new CheckoutError('Stock changed. The order was cancelled; review quantities before starting a new sale.', 409);
                    }
                    if ($body['method'] === 'cash') {
                        $order->set_payment_method('cod');
                        $order->set_payment_method_title('Cash collected at POS');
                        $order->update_meta_data('_kizlo_pos_cash_collected', (string) time());
                        $order->save();
                        $order->payment_complete();
                        if (!$order->get_date_paid() || !$order->is_paid()) throw new CheckoutError('Cash confirmation needs review in WooCommerce. Do not collect again.', 409, ['uncertain' => true]);
                    } else { PaymentPage::url($order); }
                    $order->update_meta_data('_kizlo_pos_ready', 'yes');
                    $order->save();
                    $reservation['state'] = 'ready';
                    update_option($key, $reservation, false);
                    do_action('kizlo_pos_sale_created', $order);
                    return self::status($id);
                });
            });
        });
    }
}
