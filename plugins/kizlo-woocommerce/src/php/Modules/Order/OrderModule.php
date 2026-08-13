<?php

namespace Kizlo\WooCommerce\Modules\Order;

use WP_REST_Request;
use WP_REST_Response;
use Kizlo\WooCommerce\Modules\Order\OrderRepository;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;
use WC_Order;
use WP_Error;

class OrderModule
{
    private OrderRepository $order;

    public function __construct()
    {
        $this->order = new OrderRepository();
    }

    public function register(): void
    {
        add_filter('woocommerce_rest_prepare_shop_order_object', [$this, 'prepareOrderCallback'], PHP_INT_MAX, 2);

        kizlo_register_route([
            'id'        => 'woocommerce.orders',
            'operation' => 'manage_stock',
            'method'    => 'POST',
            'route'     => '/orders/(?P<order_id>\d+)/stock',
            'summary'   => 'Reduce or increase the stock an order holds',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'order_id' => [
                        'description'       => 'The WooCommerce order ID.',
                        'type'              => 'integer',
                        'required'          => true,
                        'sanitize_callback' => 'absint',
                        'validate_callback' => static function ($value): bool {
                            return is_numeric($value) && $value > 0;
                        },
                    ],
                    'action' => [
                        'description'       => 'The stock action to perform.',
                        'type'              => 'string',
                        'required'          => true,
                        'enum'              => ['reduce', 'increase'],
                        'sanitize_callback' => 'sanitize_text_field',
                        'validate_callback' => static function ($value): bool {
                            return in_array($value, ['reduce', 'increase'], true);
                        },
                    ],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The stock was adjusted.', 'body' => ['$ref' => WooCommerceSchemas::STOCK_RESULT]],
                '404' => ['description' => 'Order not found.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
                '409' => ['description' => 'Stock was already reduced for this order.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
            ],
            'callback'  => [$this, 'manageStockApiCallback'],
        ]);
    }

    public function prepareOrderCallback(WP_REST_Response | WP_Error $response, WC_Order $order): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        $response->set_data($this->order->extendOrder($response->get_data(), $order));

        return $response;
    }

    public function manageStockApiCallback(WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        $order_id = (int) $request->get_param('order_id');
        $action   = $request->get_param('action');

        $data = $this->order->manageStock($order_id, $action);

        return rest_ensure_response($data);
    }
}
