<?php

namespace Kizlo\Pos\Modules\Checkout;

use Kizlo\Pos\Support\Lock;

final class PaymentPage
{
    private ?\WC_Order $authorized = null;
    private ?Context $context = null;
    private ?int $previousUser = null;

    public function register(): void
    {
        add_action('wp', [$this, 'authorize'], 5);
        add_filter('user_has_cap', [$this, 'capability'], 100, 4);
        add_filter('woocommerce_order_email_verification_required', [$this, 'verification'], 100, 3);
        add_filter('kizlo_headless_render_frontend', fn($render) => $render || $this->authorized !== null);
        add_filter('woocommerce_available_payment_gateways', [$this, 'gateways'], 100);
        add_filter('woocommerce_get_checkout_payment_url', [$this, 'paymentUrl'], 100, 2);
        add_filter('woocommerce_get_checkout_order_received_url', [$this, 'returnUrl'], 100, 2);
        add_filter('woocommerce_get_cancel_order_url_raw', [$this, 'returnUrl'], 100, 2);
        add_filter('woocommerce_get_cancel_order_url', [$this, 'returnUrl'], 100, 2);
        add_action('shutdown', [$this, 'close'], 0);
    }

    public static function isPos(\WC_Order $order): bool { return $order->get_created_via() === 'kizlo-pos'; }

    private static function token(\WC_Order $order): string
    {
        return hash_hmac('sha256', $order->get_id() . ':' . $order->get_order_key() . ':' . $order->get_meta('_kizlo_pos_payment_revision') . ':' . $order->get_meta('_kizlo_pos_payment_expires'), wp_salt('auth'));
    }

    public static function url(\WC_Order $order): string
    {
        if (!$order->get_meta('_kizlo_pos_payment_revision')) {
            $order->update_meta_data('_kizlo_pos_payment_revision', bin2hex(random_bytes(32)));
            $order->update_meta_data('_kizlo_pos_payment_expires', (string) (time() + DAY_IN_SECONDS));
            $order->update_meta_data('_kizlo_pos_payment_digest', hash('sha256', self::token($order)));
            $order->save();
        }
        $base = add_query_arg(['pay_for_order' => 'true', 'key' => $order->get_order_key()], wc_get_endpoint_url('order-pay', (string) $order->get_id(), wc_get_checkout_url()));
        return add_query_arg('pos_payment', self::token($order), $base);
    }

    public static function valid(\WC_Order $order, string $key, string $token): bool
    {
        return $order->needs_payment() && self::authentic($order, $key, $token);
    }

    private static function authentic(\WC_Order $order, string $key, string $token): bool
    {
        return self::isPos($order) && strlen($token) === 64 && (int) $order->get_meta('_kizlo_pos_payment_expires') >= time()
            && $order->get_meta('_kizlo_pos_method') !== 'cash'
            && (!$order->get_meta('_kizlo_pos_sale_id') || $order->get_meta('_kizlo_pos_ready') === 'yes')
            && hash_equals($order->get_order_key(), $key) && hash_equals((string) $order->get_meta('_kizlo_pos_payment_digest'), hash('sha256', $token))
            && hash_equals(self::token($order), $token) && !$order->has_status(['cancelled', 'refunded', 'trash']);
    }

    public function paymentUrl(string $url, \WC_Order $order): string { return self::isPos($order) ? self::url($order) : $url; }
    public function returnUrl(string $url, $order): string { return $order instanceof \WC_Order && self::isPos($order) ? self::url($order) : $url; }

    public function capability(array $allcaps, array $caps, array $args, $user): array
    {
        if ($this->authorized && ($args[0] ?? '') === 'pay_for_order' && (int) ($args[2] ?? 0) === $this->authorized->get_id()) $allcaps['pay_for_order'] = true;
        return $allcaps;
    }

    public function verification(bool $required, $order, string $context): bool
    {
        return $this->authorized && $order instanceof \WC_Order && $order->get_id() === $this->authorized->get_id() && $context === 'order-pay' ? false : $required;
    }

    public function gateways(array $gateways): array
    {
        if (!$this->authorized) return $gateways;
        return array_intersect_key($gateways, array_flip((array) $this->authorized->get_meta('_kizlo_pos_online_gateways')));
    }

    public function authorize(): void
    {
        global $wp;
        $id = absint($wp->query_vars['order-pay'] ?? 0);
        $order = $id ? wc_get_order($id) : false;
        if (!$order || !self::isPos($order)) return;
        // The native POST handler checks the Woo nonce/key, but not the POS capability.
        $key = isset($_GET['key']) && is_string($_GET['key']) ? wp_unslash($_GET['key']) : '';
        $token = isset($_GET['pos_payment']) && is_string($_GET['pos_payment']) ? wp_unslash($_GET['pos_payment']) : '';
        if (!self::authentic($order, $key, $token)) wp_die('This POS payment link is invalid or expired. Ask the store for assistance.', 'Payment unavailable', ['response' => 403]);
        nocache_headers();
        if (!headers_sent()) header('Referrer-Policy: no-referrer');
        if ($order->is_paid() && $order->get_date_paid()) wp_die('Payment received. You can close this window.', 'Payment received', ['response' => 200]);
        if (!$order->needs_payment()) wp_die('This order is not currently payable. Ask the store for assistance.', 'Payment unavailable', ['response' => 409]);
        $this->authorized = $order;
        // An iframe inherits staff cookies. Render/process as a request-local guest so gateways cannot offer staff saved cards.
        $this->previousUser = get_current_user_id();
        wp_set_current_user(0);
        try { $this->context = new Context($order->get_address('billing'), $order->get_address('shipping')); }
        catch (\Throwable $error) { $this->close(); throw $error; }
        if (!empty($_POST['woocommerce_pay'])) {
            // Preserve the native form/gateway contract while wrapping a POS attempt in a serialized operation.
            remove_action('wp', ['WC_Form_Handler', 'pay_action'], 20);
            add_action('wp', [$this, 'pay'], 20);
        }
    }

    public function close(): void
    {
        $this->context?->close();
        $this->context = null;
        $this->authorized = null;
        if ($this->previousUser !== null) wp_set_current_user($this->previousUser);
        $this->previousUser = null;
    }

    public function pay(): void
    {
        $order = $this->authorized;
        if (!$order) return;
        $nonce = isset($_POST['woocommerce-pay-nonce']) && is_string($_POST['woocommerce-pay-nonce']) ? wp_unslash($_POST['woocommerce-pay-nonce']) : '';
        if (!wp_verify_nonce($nonce, 'woocommerce-pay')) { wc_add_notice('Refresh this payment page before trying again.', 'error'); return; }
        if (!empty($_POST['terms-field']) && empty($_POST['terms'])) { wc_add_notice('Accept the terms before paying.', 'error'); return; }
        try {
            $result = Lock::run('pay:' . $order->get_id(), function () use ($order) {
                $order = wc_get_order($order->get_id());
                if (!$order || !$order->needs_payment()) throw new CheckoutError('This order no longer needs payment.', 409);
                if ($order->get_meta('_kizlo_pos_payment_attempt') && !$order->has_status('failed')) throw new CheckoutError('A payment attempt is awaiting confirmation. Contact the store before retrying.', 409);
                $id = isset($_POST['payment_method']) && is_string($_POST['payment_method']) ? wc_clean(wp_unslash($_POST['payment_method'])) : '';
                $gateway = WC()->payment_gateways()->get_available_payment_gateways()[$id] ?? null;
                if (!$gateway) throw new CheckoutError('Choose an available online payment method.');
                do_action('woocommerce_before_pay_action', $order);
                $order->set_payment_method($gateway->id);
                $order->set_payment_method_title($gateway->get_title());
                $gateway->validate_fields();
                if (wc_notice_count('error')) return null;
                Lock::run('inventory', static function () use ($order): void {
                    if (!$order->get_data_store()->get_stock_reduced($order->get_id())) {
                        $quantities = [];
                        foreach ($order->get_items() as $item) {
                            if (!$item instanceof \WC_Order_Item_Product) continue;
                            $product = $item->get_product();
                            if (!$product || !$product->is_in_stock()) throw new CheckoutError('An item is no longer in stock. Contact the store before paying.', 409);
                            $stockId = $product->get_stock_managed_by_id();
                            $quantities[$stockId] = ($quantities[$stockId] ?? 0) + $item->get_quantity();
                        }
                        foreach ($quantities as $id => $quantity) {
                            $product = wc_get_product($id);
                            if ($product && $product->managing_stock() && !$product->backorders_allowed() && $product->get_stock_quantity() - wc_get_held_stock_quantity($product, $order->get_id()) < $quantity) throw new CheckoutError('Stock changed. Contact the store before paying.', 409);
                        }
                        try { wc_reserve_stock_for_order($order); }
                        catch (\Exception $error) { throw new CheckoutError('Stock could not be reserved. Contact the store before paying.', 409); }
                    }
                });
                $order->update_meta_data('_kizlo_pos_payment_attempt', wp_generate_uuid4());
                $order->save();
                $result = $gateway->process_payment($order->get_id());
                if (($result['result'] ?? '') === 'success' && !empty($result['redirect'])) {
                    $result['order_id'] = $order->get_id();
                    return apply_filters('woocommerce_payment_successful_result', $result, $order->get_id());
                }
                // An error without an authoritative failed state can be an uncertain charge.
                throw new CheckoutError('Payment was not confirmed. Check the order with the store before retrying.', 409);
            });
            if (is_array($result) && !empty($result['redirect'])) { wp_redirect($result['redirect']); exit; }
        } catch (\Throwable $error) {
            wc_add_notice($error instanceof CheckoutError ? $error->getMessage() : 'Payment confirmation is unavailable. Contact the store before trying again.', 'error');
        }
        do_action('woocommerce_after_pay_action', $order);
    }
}
