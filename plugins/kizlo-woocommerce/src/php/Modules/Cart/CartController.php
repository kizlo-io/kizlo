<?php

namespace Kizlo\WooCommerce\Modules\Cart;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;

/**
 * Headless cart REST API — kept intentionally tiny.
 *
 * All cart and checkout operations live at /wc/store/v1/* (Store API).
 * The only thing Store API doesn't give us is merging a guest cart into a
 * user's cart on login, so that's all this class registers.
 *
 * Current-user switching for headless requests is centralised in
 * {@see \Kizlo\Modules\WooCommerce\Service::maybeSwitchToCartUser()}, which runs on
 * rest_pre_dispatch — so by the time this callback runs, get_current_user_id()
 * already reflects the resolved cart owner.
 */
class CartController
{
    public function register(): void
    {
        kizlo_register_route([
            'methods'  => 'POST',
            'route'    => '/cart/merge',
            'callback' => [$this, 'mergeCart'],
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
