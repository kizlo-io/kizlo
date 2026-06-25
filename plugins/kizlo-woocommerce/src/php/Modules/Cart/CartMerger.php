<?php

namespace Kizlo\WooCommerce\Modules\Cart;

use WP_Error;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;

/**
 * Merges a guest cart (identified by its X-Kizlo-Guest-Token) into the cart
 * currently bound to the request. The current request must already resolve to
 * an authenticated user (X-Kizlo-User-Id present) — otherwise there is nothing
 * to merge into.
 *
 * Strategy: re-add each guest item via the Store API CartController so stock,
 * price, and validation rules re-run. The guest session row is then deleted.
 */
class CartMerger
{
    public static function merge(string $guest_token): true|WP_Error
    {
        $session = WC()->session;
        if (! $session instanceof SessionHandler) {
            return new WP_Error(
                'kizlo_session_unavailable',
                'Headless session handler is not active for this request.',
                ['status' => 500]
            );
        }

        if ($session->get_resolved_user_id() === null) {
            return new WP_Error(
                'kizlo_user_required',
                'Merge requires an authenticated request (X-Kizlo-User-Id).',
                ['status' => 400]
            );
        }

        if (! str_starts_with($guest_token, SessionHandler::PREFIX_GUEST)) {
            return new WP_Error(
                'kizlo_invalid_guest_token',
                'Guest token must reference a guest session.',
                ['status' => 400]
            );
        }

        $guest_data = $session->get_session($guest_token, null);
        if ($guest_data === null) {
            return new WP_Error(
                'kizlo_guest_cart_not_found',
                'Guest cart not found or already expired.',
                ['status' => 404]
            );
        }

        $cart_contents = self::unserialize_cart($guest_data['cart'] ?? null);

        $controller = CartSerializer::cart_controller();
        foreach ($cart_contents as $item) {
            try {
                $controller->add_to_cart([
                    'id'             => (int) ($item['product_id'] ?? 0),
                    'quantity'       => (int) ($item['quantity'] ?? 1),
                    'variation_id'   => (int) ($item['variation_id'] ?? 0),
                    'variation'      => (array) ($item['variation'] ?? []),
                    'cart_item_data' => array_diff_key(
                        (array) $item,
                        array_flip(['key', 'product_id', 'variation_id', 'variation', 'quantity', 'data', 'data_hash', 'line_tax_data', 'line_subtotal', 'line_subtotal_tax', 'line_total', 'line_tax'])
                    ),
                ]);
            } catch (\Throwable) {
                // Skip items that fail validation (e.g. out of stock) so the
                // merge proceeds for everything else.
                continue;
            }
        }

        $session->delete_session($guest_token);
        CartSerializer::calculate_totals();

        return true;
    }

    private static function unserialize_cart(mixed $raw): array
    {
        if (is_array($raw)) return $raw;
        if (! is_string($raw) || $raw === '') return [];

        $data = maybe_unserialize($raw);
        return is_array($data) ? $data : [];
    }
}
