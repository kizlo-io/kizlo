<?php

namespace Kizlo\WooCommerce\Modules\Cart;

use Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema;
use Automattic\WooCommerce\StoreApi\Schemas\V1\CartItemSchema;

class CartModule
{

    public function register(): void
    {
        add_action('woocommerce_blocks_loaded', [$this, 'extendShopApiCartSchema'], PHP_INT_MAX);

        (new CartController())->register();
    }

    public function extendShopApiCartSchema()
    {
        woocommerce_store_api_register_endpoint_data([
            'namespace'       => 'kizlo',
            'endpoint'        => CartSchema::IDENTIFIER,
            'data_callback'   => function () {
                return array_merge([], kizlo_apply_extend_filter('cart'));
            },
            'schema_type'     => ARRAY_A,
        ]);

        woocommerce_store_api_register_endpoint_data([
            'namespace'       => 'kizlo',
            'endpoint'        => CartItemSchema::IDENTIFIER,
            'data_callback'   => function ($cart_item) {
                return array_merge([], kizlo_apply_extend_filter('cart_item', $cart_item));
            },
            'schema_type'     => ARRAY_A,
        ]);
    }
}
