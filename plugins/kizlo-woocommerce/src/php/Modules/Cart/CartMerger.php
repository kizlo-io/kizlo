<?php

namespace Kizlo\WooCommerce\Modules\Cart;

use WP_Error;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;

/** Merge one guest cart into an authenticated customer's cart exactly once. */
final class CartMerger
{
    private const LOCK_TIMEOUT_SECONDS = 5;

    /** @var array<int, array{code: string, message: string}> */
    private static array $mergeErrors = [];

    /**
     * The customer session is initialized inside the advisory lock. A second
     * request therefore loads the customer cart only after the first merge has
     * been persisted, avoiding a stale shutdown save that could undo it.
     *
     * @param callable(): (true|WP_Error) $initialize
     */
    public static function merge(string $guestToken, callable $initialize): true|WP_Error
    {
        self::$mergeErrors = [];

        if (! SessionHandler::isValidGuestToken($guestToken)) {
            return new WP_Error(
                'kizlo_invalid_guest_token',
                'Guest token must have the complete headless session shape.',
                ['status' => 401]
            );
        }

        $lockName = self::lockName($guestToken);
        if (! self::acquireLock($lockName)) {
            return new WP_Error(
                'kizlo_cart_merge_lock_unavailable',
                'The guest cart is already being merged. Retry the request.',
                ['status' => 503]
            );
        }

        try {
            $initialized = $initialize();
            if ($initialized instanceof WP_Error) return $initialized;

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
                    'A resolved user identity is required to merge a guest cart.',
                    ['status' => 401]
                );
            }

            // Always re-read after taking the lock. Absence means a previous
            // request completed this transition and is an idempotent success.
            $guestData = $session->get_session($guestToken, null);
            if ($guestData === null) return true;

            $controller = CartSerializer::cart_controller();
            foreach (self::unserializeCart($guestData['cart'] ?? null) as $item) {
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
                } catch (\Throwable $error) {
                    self::$mergeErrors[] = [
                        'code'    => method_exists($error, 'getErrorCode')
                            ? (string) $error->getErrorCode()
                            : 'kizlo_cart_merge_item_rejected',
                        'message' => $error->getMessage() !== ''
                            ? $error->getMessage()
                            : 'A guest cart item could not be restored.',
                    ];
                }
            }

            CartSerializer::calculate_totals();
            WC()->cart->set_session();

            if (! $session->persist()) {
                return new WP_Error(
                    'kizlo_cart_merge_persistence_failed',
                    'The customer cart could not be persisted. The guest cart was retained.',
                    ['status' => 500]
                );
            }

            $session->delete_session($guestToken);

            return true;
        } finally {
            self::releaseLock($lockName);
        }
    }

    /** Add rejected guest lines to WooCommerce's existing cart `errors` field. */
    public static function addErrors(WP_Error $errors): void
    {
        foreach (self::$mergeErrors as $error) {
            $errors->add($error['code'], $error['message']);
        }
    }

    private static function lockName(string $guestToken): string
    {
        return 'kizlo_cart_' . substr(hash('sha256', $guestToken), 0, 48);
    }

    private static function acquireLock(string $name): bool
    {
        global $wpdb;

        return (string) $wpdb->get_var(
            $wpdb->prepare('SELECT GET_LOCK(%s, %d)', $name, self::LOCK_TIMEOUT_SECONDS)
        ) === '1';
    }

    private static function releaseLock(string $name): void
    {
        global $wpdb;
        $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $name));
    }

    /** @return array<int, array<string, mixed>> */
    private static function unserializeCart(mixed $raw): array
    {
        if (is_array($raw)) return $raw;
        if (! is_string($raw) || $raw === '') return [];

        $data = maybe_unserialize($raw);
        return is_array($data) ? $data : [];
    }
}
