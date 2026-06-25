<?php

namespace Kizlo\WooCommerce\Modules\Cart;

use Automattic\WooCommerce\StoreApi\SchemaController;
use Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Automattic\WooCommerce\StoreApi\Utilities\CartController;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use WC_Cart;

/**
 * Produces a Store-API-shaped cart response from the live WC()->cart, and exposes
 * the same cart utilities Store API uses internally so behavior stays consistent.
 */
class CartSerializer
{
    public static function get_cart_for_response(): WC_Cart
    {
        return self::cart_controller()->get_cart_for_response();
    }

    public static function calculate_totals(): WC_Cart
    {
        return self::cart_controller()->calculate_totals();
    }

    public static function cart_controller(): CartController
    {
        return new CartController();
    }

    /**
     * Serialize the current WC()->cart using the official Store API schema, then
     * augment with our headless metadata at the top level.
     */
    public static function serialize(): array
    {
        $cart    = self::get_cart_for_response();
        $payload = self::cart_schema()->get_item_response($cart);

        $session = WC()->session;
        $guest_token = $session instanceof SessionHandler ? $session->get_guest_token() : '';
        $user_id     = $session instanceof SessionHandler ? $session->get_resolved_user_id() : null;

        $payload['guest_token'] = $guest_token;
        $payload['user_id']     = $user_id;

        return $payload;
    }

    private static function cart_schema(): CartSchema
    {
        /** @var SchemaController $controller */
        $controller = StoreApi::container()->get(SchemaController::class);

        /** @var CartSchema $schema */
        $schema = $controller->get(CartSchema::IDENTIFIER);

        return $schema;
    }
}
