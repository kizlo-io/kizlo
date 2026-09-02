<?php

namespace Kizlo\WooCommerce\Modules\Cart;

use Automattic\WooCommerce\StoreApi\Utilities\CartController;
use WC_Cart;

/**
 * Exposes the same cart utilities Store API uses internally so merge behavior
 * stays consistent with an ordinary cart request.
 */
class CartSerializer
{
    public static function calculate_totals(): WC_Cart
    {
        return self::cart_controller()->calculate_totals();
    }

    public static function cart_controller(): CartController
    {
        return new CartController();
    }
}
