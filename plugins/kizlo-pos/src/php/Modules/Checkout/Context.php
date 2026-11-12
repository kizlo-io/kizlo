<?php

namespace Kizlo\Pos\Modules\Checkout;

/** Sale calculations must never save data to a cashier's customer or persistent cart. */
final class Context
{
    private array $previous;
    private bool $closed = false;
    private array $shipping;

    public function __construct(array $billing, array $shipping)
    {
        $wc = WC();
        $this->previous = [$wc->session, $wc->customer, $wc->cart];
        $shippingService = $wc->shipping();
        $this->shipping = [$shippingService->packages, $shippingService->shipping_methods];
        $shippingService->packages = [];
        $shippingService->shipping_methods = null;
        try {
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
            try { $wc->cart = new \WC_Cart(); }
            finally { remove_filter('woocommerce_cart_session_initialize', '__return_false', PHP_INT_MAX); }
            // WC_Cart installs global listeners even when session persistence is disabled.
            global $wp_filter;
            foreach ($wp_filter as $hook => $callbacks) {
                foreach ($callbacks->callbacks as $priority => $entries) {
                    foreach ($entries as $entry) {
                        if (is_array($entry['function']) && $entry['function'][0] === $wc->cart) remove_filter($hook, $entry['function'], $priority);
                    }
                }
            }
        } catch (\Throwable $error) { $this->close(); throw $error; }
    }

    public function close(): void
    {
        if ($this->closed) return;
        [WC()->session, WC()->customer, WC()->cart] = $this->previous;
        [WC()->shipping()->packages, WC()->shipping()->shipping_methods] = $this->shipping;
        $this->closed = true;
    }
}
