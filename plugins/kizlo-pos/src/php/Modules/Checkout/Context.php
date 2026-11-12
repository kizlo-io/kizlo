<?php

namespace Kizlo\Pos\Modules\Checkout;

/** Sale calculations must never save data to a cashier's customer or persistent cart. */
final class Context
{
    private array $previous;
    private bool $closed = false;
    private array $shipping;
    private array $cartHooks = [];

    public function __construct(array $billing, array $shipping)
    {
        $wc = WC();
        $this->previous = [$wc->session, $wc->customer, $wc->cart];
        $shippingService = $wc->shipping();
        $this->shipping = [$shippingService->packages, $shippingService->shipping_methods];
        $shippingService->packages = [];
        $shippingService->shipping_methods = null;
        try {
            $this->detachCartHooks(true);
            $wc->session = new class extends \WC_Session {
                public function has_session() { return true; }
                public function set_customer_session_cookie($set) {}
                public function save_data($old_session_key = 0) {}
            };
            $wc->customer = new \WC_Customer(0, true);
            remove_action('shutdown', [$wc->customer, 'save'], 10);
            foreach (['billing' => $billing, 'shipping' => $shipping] as $kind => $address) {
                foreach ($address as $field => $value) {
                    $setter = 'set_' . $kind . '_' . $field;
                    if (is_callable([$wc->customer, $setter])) $wc->customer->$setter($value);
                }
            }
            $wc->customer->set_calculated_shipping(true);
            add_filter('woocommerce_cart_session_initialize', '__return_false', PHP_INT_MAX);
            try {
                // A first REST cart read must not restore the cashier's persistent web cart.
                $wc->cart = new class extends \WC_Cart {
                    public function get_cart() { return array_filter($this->get_cart_contents()); }
                    public function empty_cart($clear_persistent_cart = true) { parent::empty_cart(false); }
                };
            }
            finally { remove_filter('woocommerce_cart_session_initialize', '__return_false', PHP_INT_MAX); }
            $this->detachCartHooks(false);
        } catch (\Throwable $error) { $this->close(); throw $error; }
    }

    private function detachCartHooks(bool $remember): void
    {
        global $wp_filter;
        foreach ($wp_filter as $hook => $callbacks) {
            foreach ($callbacks->callbacks as $priority => $entries) {
                foreach ($entries as $entry) {
                    $callback = $entry['function'];
                    if (!is_array($callback) || !($callback[0] instanceof \WC_Cart || $callback[0] instanceof \WC_Cart_Session)) continue;
                    if ($remember) $this->cartHooks[] = [$hook, $callback, $priority, $entry['accepted_args']];
                    remove_filter($hook, $callback, $priority);
                }
            }
        }
    }

    public function close(): void
    {
        if ($this->closed) return;
        [WC()->session, WC()->customer, WC()->cart] = $this->previous;
        [WC()->shipping()->packages, WC()->shipping()->shipping_methods] = $this->shipping;
        foreach ($this->cartHooks as [$hook, $callback, $priority, $args]) add_filter($hook, $callback, $priority, $args);
        $this->closed = true;
    }
}
