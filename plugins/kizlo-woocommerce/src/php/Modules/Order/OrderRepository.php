<?php

namespace Kizlo\WooCommerce\Modules\Order;

use WC_Order;
use WP_Error;
use WP_REST_Request;
use WC_Order_Refund;
use Automattic\WooCommerce\StoreApi\Formatters\CurrencyFormatter;

class OrderRepository
{
    public function __construct()
    {
        add_action(
            'woocommerce_rest_insert_shop_order_object',
            [$this, 'addNoteOnOrderInsert'],
            PHP_INT_MAX,
            3
        );
    }

    public function extendOrder(array $data, WC_Order | WC_Order_Refund $order): array
    {
        $formatter = new CurrencyFormatter();

        $data['kizlo'] = [
            'currency_format' => $formatter->format([]),
            'extend' => apply_filters('kizlo_extend_order', [], $order)
        ];
        return $data;
    }

    public function manageStock(int $order_id, string $action): WP_Error | array
    {
        $order    = wc_get_order($order_id);

        if (! $order instanceof WC_Order) {
            return new WP_Error(
                'kizlo_order_not_found',
                'Order not found.',
                ['status' => 404]
            );
        }

        if ($action === 'reduce') {
            if ($order->get_data_store()->get_stock_reduced($order)) {
                return new WP_Error(
                    'kizlo_stock_already_reduced',
                    'Stock has already been reduced for this order.',
                    ['status' => 409]
                );
            }

            wc_reduce_stock_levels($order);

            $message = 'Stock reduced successfully.';
        } else {
            wc_increase_stock_levels($order);

            $message = 'Stock increased successfully.';
        }

        return [
            'success'  => true,
            'message'  => $message,
            'order_id' => $order_id,
            'action'   => $action,
        ];
    }

    /**
     * Adds an order note from a custom `kizlo_note` property in the REST payload.
     *
     * Eliminates the need for a separate order note API call by intercepting
     * the `kizlo_note` parameter on order create/update requests and adding
     * it as an order note after the order is saved.
     */
    public function addNoteOnOrderInsert(WC_Order $order, WP_REST_Request $request, bool $creating)
    {
        $note = $request->get_param('kizlo_note');

        if (empty($note) || ! is_string($note)) return;

        $order->add_order_note(
            sanitize_textarea_field($note),
            0,
            true
        );
    }
}
