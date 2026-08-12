<?php

namespace Kizlo\WooCommerce\Modules\Cart;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;

/**
 * Headless cart REST API — kept intentionally tiny.
 *
 * All cart and checkout operations live at /wc/store/v1/* (Store API).
 * The only thing Store API doesn't give us is merging a guest cart into a
 * user's cart on login, so that's all this class registers.
 *
 * Current-user switching for headless requests is centralised in
 * {@see \Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceModule::maybeSwitchToCartUser()},
 * which runs on rest_dispatch_request — so by the time this callback runs,
 * get_current_user_id() already reflects the resolved cart owner.
 */
class CartController
{
    public function register(): void
    {
        kizlo_register_route([
            'id'        => 'woocommerce.cart',
            'operation' => 'merge',
            'methods'   => 'POST',
            'route'     => '/cart/merge',
            'summary'   => 'Merge a guest cart into the signed-in user\'s cart',

            // The guest cart is named by the X-Kizlo-Guest-Token header rather
            // than the body, so there is nothing to declare here.
            'input'     => ['type' => 'object'],
            'responses' => [
                '200' => ['description' => 'The merged cart.', 'body' => ['$ref' => WooCommerceSchemas::CART]],
                '400' => ['description' => 'The X-Kizlo-Guest-Token header was missing, or named no cart.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
            ],
            'callback'  => [$this, 'mergeCart'],
        ]);
    }

    public function mergeCart(WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        $guest_token = (string) $request->get_header(SessionHandler::HEADER_GUEST_TOKEN);
        if ($guest_token === '') {
            return new WP_Error(
                'kizlo_missing_guest_token',
                'X-Kizlo-Guest-Token header is required for merge.',
                ['status' => 400]
            );
        }

        // WC()->cart is null until the cart is loaded; WC stubs type it as a
        // non-null WC_Cart, so PHPStan wrongly reads this guard as redundant.
        // @phpstan-ignore instanceof.alwaysTrue
        if (WC()->cart instanceof \WC_Cart) {
            WC()->cart->get_cart();
        }

        $result = CartMerger::merge($guest_token);
        if ($result instanceof WP_Error) {
            return $result;
        }

        return rest_ensure_response(CartSerializer::serialize());
    }
}
