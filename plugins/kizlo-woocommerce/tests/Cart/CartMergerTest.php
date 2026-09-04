<?php

namespace Kizlo\WooCommerce\Tests\Cart;

use Kizlo\WooCommerce\Modules\Cart\CartMerger;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_Product_Simple;
use WP_Error;

class CartMergerTest extends TestCase
{
    private int $customerId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->customerId = self::factory()->user->create(['role' => 'subscriber']);
    }

    protected function tearDown(): void
    {
        $this->resetWooCommerce();
        parent::tearDown();
    }

    public function test_guest_cart_merges_and_a_sequential_duplicate_is_a_successful_no_op(): void
    {
        $product    = $this->product('Merge product');
        $guestToken = $this->guestToken($product->get_id());
        $this->seedGuestCart($guestToken, [
            $this->cartItem($product->get_id(), 2),
        ]);

        $first = CartMerger::merge($guestToken, fn(): true => $this->initializeCustomer());
        $this->assertTrue($first);
        $this->assertSame(2, WC()->cart->get_cart_contents_count());
        $this->assertNull($this->storedSession($guestToken));
        $this->assertNotNull($this->storedSession((string) $this->customerId));

        $second = CartMerger::merge($guestToken, static fn(): true => true);
        $this->assertTrue($second);
        $this->assertSame(2, WC()->cart->get_cart_contents_count());
    }

    public function test_partial_merge_keeps_valid_items_and_surfaces_rejected_lines_as_cart_errors(): void
    {
        $product    = $this->product('Valid merge product');
        $guestToken = $this->guestToken($product->get_id());
        $this->seedGuestCart($guestToken, [
            $this->cartItem($product->get_id(), 1),
            $this->cartItem(99999999, 1),
        ]);

        $result = CartMerger::merge($guestToken, fn(): true => $this->initializeCustomer());
        $errors = new WP_Error();
        CartMerger::addErrors($errors);

        $this->assertTrue($result);
        $this->assertSame(1, WC()->cart->get_cart_contents_count());
        $this->assertTrue($errors->has_errors());
        $this->assertNotEmpty($errors->get_error_messages());
    }

    public function test_a_contended_advisory_lock_leaves_the_guest_session_unconsumed(): void
    {
        $product    = $this->product('Locked merge product');
        $guestToken = $this->guestToken($product->get_id());
        $this->seedGuestCart($guestToken, [$this->cartItem($product->get_id(), 1)]);

        $other    = new \wpdb(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST);
        $lockName = 'kizlo_cart_' . substr(hash('sha256', $guestToken), 0, 48);
        $locked   = $other->get_var($other->prepare('SELECT GET_LOCK(%s, 0)', $lockName));
        $this->assertSame('1', (string) $locked);

        try {
            $result = CartMerger::merge(
                $guestToken,
                static function (): true {
                    throw new \RuntimeException('Initialization must not run without the lock.');
                }
            );
        } finally {
            $other->get_var($other->prepare('SELECT RELEASE_LOCK(%s)', $lockName));
            $other->close();
        }

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame('kizlo_cart_merge_lock_unavailable', $result->get_error_code());
        $this->assertNotNull($this->storedSession($guestToken));

        $retry = CartMerger::merge($guestToken, fn(): true => $this->initializeCustomer());
        $this->assertTrue($retry);
        $this->assertSame(1, WC()->cart->get_cart_contents_count());
        $this->assertNull($this->storedSession($guestToken));
    }

    public function test_headless_session_expiration_is_exactly_48_hours(): void
    {
        $before  = time() + SessionHandler::SESSION_LIFETIME;
        $session = new SessionHandler();
        $after   = time() + SessionHandler::SESSION_LIFETIME;

        $property = new \ReflectionProperty($session, '_session_expiration');
        $expires  = (int) $property->getValue($session);

        $this->assertGreaterThanOrEqual($before, $expires);
        $this->assertLessThanOrEqual($after, $expires);
    }

    private function initializeCustomer(): true
    {
        $this->resetWooCommerce();
        wp_set_current_user($this->customerId);
        SessionHandler::prepareIdentity(['user_id' => $this->customerId, 'guest_token' => null]);

        $session      = new SessionHandler();
        WC()->session = $session;
        $session->init();
        wc_load_cart();

        return true;
    }

    private function product(string $name): WC_Product_Simple
    {
        $product = new WC_Product_Simple();
        $product->set_name($name);
        $product->set_regular_price('10');
        $product->set_status('publish');
        $product->save();
        return $product;
    }

    /** @return array<string, mixed> */
    private function cartItem(int $productId, int $quantity): array
    {
        return [
            'key'          => md5($productId . ':' . $quantity),
            'product_id'   => $productId,
            'variation_id' => 0,
            'variation'    => [],
            'quantity'     => $quantity,
        ];
    }

    /** @param array<int, array<string, mixed>> $items */
    private function seedGuestCart(string $guestToken, array $items): void
    {
        global $wpdb;

        $cart = [];
        foreach ($items as $item) $cart[(string) $item['key']] = $item;

        $wpdb->replace(
            $wpdb->prefix . 'woocommerce_sessions',
            [
                'session_key'    => $guestToken,
                'session_value'  => maybe_serialize(['cart' => maybe_serialize($cart)]),
                'session_expiry' => time() + SessionHandler::SESSION_LIFETIME,
            ],
            ['%s', '%s', '%d']
        );
    }

    /** @return array<string, mixed>|null */
    private function storedSession(string $key): ?array
    {
        global $wpdb;

        $value = $wpdb->get_var(
            $wpdb->prepare(
                'SELECT session_value FROM %i WHERE session_key = %s',
                $wpdb->prefix . 'woocommerce_sessions',
                $key
            )
        );

        if (! is_string($value)) return null;
        $session = maybe_unserialize($value);
        return is_array($session) ? $session : null;
    }

    private function guestToken(int $seed): string
    {
        return SessionHandler::PREFIX_GUEST . substr(hash('sha256', (string) $seed), 0, 30);
    }

    private function resetWooCommerce(): void
    {
        if (WC()->session instanceof SessionHandler) {
            remove_action('shutdown', [WC()->session, 'save_data'], 20);
        }
        // @phpstan-ignore instanceof.alwaysTrue
        if (WC()->customer instanceof \WC_Customer) {
            remove_action('shutdown', [WC()->customer, 'save'], 10);
        }

        WC()->session  = null;
        WC()->customer = null;
        WC()->cart     = null;
        SessionHandler::clearPreparedIdentity();
    }
}
