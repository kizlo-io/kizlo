<?php

namespace Kizlo\WooCommerce\Modules\Order;

use WP_REST_Request;
use WP_REST_Response;
use Kizlo\WooCommerce\Modules\Order\OrderRepository;
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
            'methods'   => 'POST',
            'access'    => 'admin',
            'route'     => '/orders/(?P<order_id>\d+)/stock',
            'callback'  => [$this, 'manageStockApiCallback'],
            'args' => [
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
                    'description'       => 'The stock action to perform: "reduce" or "increase".',
                    'type'              => 'string',
                    'required'          => true,
                    'sanitize_callback' => 'sanitize_text_field',
                    'validate_callback' => static function ($value): bool {
                        return in_array($value, ['reduce', 'increase'], true);
                    },
                ],
            ],
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
