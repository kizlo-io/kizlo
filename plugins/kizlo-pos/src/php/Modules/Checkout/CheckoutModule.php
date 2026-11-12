<?php

namespace Kizlo\Pos\Modules\Checkout;

use Kizlo\Pos\Support\Permissions;
use Kizlo\Pos\Modules\Settings\Settings;
use Kizlo\Pos\Modules\Notification\Notifications;

final class CheckoutModule
{
    private static array $cashInstructions = [];

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'routes']);
        Customer::register();
        add_action('woocommerce_email_before_order_table', [self::class, 'beforeEmail'], 1);
        add_action('woocommerce_email_before_order_table', [self::class, 'afterEmail'], PHP_INT_MAX);
        add_filter('woocommerce_payment_complete_order_status', static function ($status, $id, $order) {
            return $order && $order->get_created_via() === 'kizlo-pos' && $order->get_meta('_kizlo_pos_cash_collected')
                ? ($order->needs_processing() ? 'processing' : 'completed') : $status;
        }, 100, 3);
    }

    public static function beforeEmail($order): void
    {
        if (!$order instanceof \WC_Order || $order->get_created_via() !== 'kizlo-pos' || !$order->get_meta('_kizlo_pos_cash_collected')) return;
        $cod = WC()->payment_gateways()->payment_gateways()['cod'] ?? null;
        if ($cod instanceof \WC_Gateway_COD) { self::$cashInstructions[] = $cod->instructions; $cod->instructions = ''; }
    }

    public static function afterEmail($order): void
    {
        if (!$order instanceof \WC_Order || $order->get_created_via() !== 'kizlo-pos' || !$order->get_meta('_kizlo_pos_cash_collected') || !self::$cashInstructions) return;
        $cod = WC()->payment_gateways()->payment_gateways()['cod'] ?? null;
        if ($cod instanceof \WC_Gateway_COD) $cod->instructions = array_pop(self::$cashInstructions);
    }

    public static function permission(): true|\WP_Error
    {
        $access = Permissions::access();
        if ($access !== true) return $access;
        if (!current_user_can('edit_shop_orders')) return new \WP_Error('kizlo_pos_forbidden', 'You cannot create or manage orders.', ['status' => 403]);
        return true;
    }

    public function routes(): void
    {
        foreach ([
            '/cart/scan' => ['POST', 'scan'], '/checkout/config' => ['GET', 'config'], '/barcode' => ['GET', 'barcode'], '/checkout/quote' => ['POST', 'quote'],
            '/checkout' => ['POST', 'commit'], '/checkout/(?P<sale_id>[a-f0-9-]{36})' => ['GET', 'status'],
            '/checkout/(?P<sale_id>[a-f0-9-]{36})/payment-link' => ['POST', 'replaceLink'],
            '/checkout/(?P<sale_id>[a-f0-9-]{36})/notifications' => ['POST', 'send'],
        ] as $route => [$method, $callback]) {
            register_rest_route('kizlo/v1', '/pos' . $route, ['methods' => $method, 'permission_callback' => [self::class, 'permission'],
                'callback' => fn(\WP_REST_Request $request) => $this->respond($callback, $request)]);
        }
    }

    public function respond(string $callback, \WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        try {
            return new \WP_REST_Response($this->$callback($request), 200, ['Cache-Control' => 'private, no-store']);
        } catch (CheckoutError $error) {
            return new \WP_Error('kizlo_pos_checkout', $error->getMessage(), ['status' => $error->status] + $error->details);
        } catch (\Throwable $error) {
            wc_get_logger()->error('POS operation failed: ' . $error::class, ['source' => 'kizlo-pos']);
            return new \WP_Error('kizlo_pos_unavailable', 'The operation could not be confirmed. Recover sale status before retrying.', ['status' => 503]);
        }
    }

    private function body(\WP_REST_Request $request): array
    {
        $body = json_decode($request->get_body(), true);
        if (!is_array($body)) throw new CheckoutError('A JSON checkout object is required.');
        return $body;
    }

    public function config(\WP_REST_Request $request): array
    {
        $country = $request->get_param('country') ?: Input::storeAddress()['country'];
        if (!is_string($country) || !isset(WC()->countries->get_countries()[$country])) throw new CheckoutError('Choose a valid country.');
        return ['fields' => Settings::checkoutFields(), 'handoff' => Settings::handoff(), 'store_address' => Input::storeAddress(),
            'countries' => WC()->countries->get_countries(), 'states' => WC()->countries->get_states(),
            'address_fields' => ['billing' => WC()->countries->get_address_fields($country, 'billing_'), 'shipping' => WC()->countries->get_address_fields($country, 'shipping_')],
            'channels' => Notifications::catalog(), 'currency' => get_woocommerce_currency()];
    }

    public function quote(\WP_REST_Request $request): array
    {
        return Calculator::run(Input::checkout($this->body($request)), static fn($quote) => $quote);
    }

    public function commit(\WP_REST_Request $request): array { return Sale::commit($this->body($request)); }
    public function status(\WP_REST_Request $request): array { return Sale::status(Input::uuid($request['sale_id'])); }
    public function replaceLink(\WP_REST_Request $request): array
    {
        $body = $this->body($request);
        Input::keys($body, ['request_id']);
        $requestId = Input::uuid($body['request_id'] ?? null);
        $id = Input::uuid($request['sale_id']);
        return \Kizlo\Pos\Support\Lock::run('sale:' . $id, static function () use ($id, $requestId): array {
            $order = Sale::order($id);
            if (!$order->needs_payment() || ($order->get_meta('_kizlo_pos_payment_attempt') && !$order->has_status('failed'))) throw new CheckoutError('Reconcile this payment before replacing its link.', 409);
            if ($order->get_meta('_kizlo_pos_link_request') !== $requestId) {
                $order->delete_meta_data('_kizlo_pos_payment_revision');
                $order->update_meta_data('_kizlo_pos_link_request', $requestId);
                PaymentPage::url($order);
            }
            return Sale::status($id);
        });
    }
    public function send(\WP_REST_Request $request): array
    {
        $body = $this->body($request);
        Input::keys($body, ['channel', 'request_id']);
        if (!Settings::handoff()['send']) throw new CheckoutError('Sending payment links is disabled.', 403);
        $order = Sale::order(Input::uuid($request['sale_id']));
        if (!$order->needs_payment()) throw new CheckoutError('This order no longer needs payment.', 409);
        return Notifications::request($order, Input::text($body['channel'] ?? '', 80), Input::uuid($body['request_id'] ?? null));
    }

    public function barcode(\WP_REST_Request $request): array
    {
        return $this->lookup($request->get_param('code'));
    }

    public function scan(\WP_REST_Request $request): array
    {
        $body = $this->body($request);
        Input::keys($body, ['code', 'items']);
        $items = Input::items($body['items'] ?? null, true);
        $match = $this->lookup($body['code'] ?? null);
        $id = $match['id'];
        $items[$id] = ($items[$id] ?? 0) + 1;
        if (count($items) > 100 || $items[$id] > 10000) throw new CheckoutError('The sale item or quantity limit has been reached.', 409);
        $products = Calculator::products($items);
        return ['id' => $id, 'name' => $products[$id]->get_name(), 'quantity' => $items[$id]];
    }

    private function lookup(mixed $code): array
    {
        // Code 128 can contain spaces and punctuation; text-field sanitization changes its identity.
        if (!is_string($code) || !preg_match('/\A[\x20-\x7E]{1,64}\z/D', $code)) throw new CheckoutError('Enter a barcode or exact SKU of up to 64 printable characters.');
        $values = [$code];
        if (ctype_digit($code) && strlen($code) === 12) $values[] = '0' . $code;
        if (ctype_digit($code) && strlen($code) === 13 && $code[0] === '0') $values[] = substr($code, 1);
        global $wpdb;
        $slots = implode(',', array_fill(0, count($values), '%s'));
        $ids = $wpdb->get_col($wpdb->prepare("SELECT DISTINCT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type IN ('product','product_variation') AND p.post_status != 'trash' AND m.meta_key='_global_unique_id' AND BINARY m.meta_value IN ($slots) LIMIT 2", ...$values));
        if ($wpdb->last_error) throw new \RuntimeException('Barcode lookup failed.');
        if (!$ids) {
            $ids = $wpdb->get_col($wpdb->prepare("SELECT DISTINCT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type IN ('product','product_variation') AND p.post_status != 'trash' AND m.meta_key='_sku' AND BINARY m.meta_value=%s LIMIT 2", $code));
            if ((string) $wpdb->last_error !== '') throw new \RuntimeException('SKU lookup failed.');
        }
        if (count($ids) > 1) throw new CheckoutError('This code identifies multiple items. Resolve duplicate identifiers in WooCommerce.', 409);
        if (!$ids) throw new CheckoutError('No product matches this code.', 404);
        $product = wc_get_product((int) $ids[0]);
        if (!$product || !current_user_can('read_product', $product->get_id()) || $product->get_status() !== 'publish') throw new CheckoutError('This product is unavailable.', 404);
        $parent = $product->is_type('variation') ? wc_get_product($product->get_parent_id()) : $product;
        if (!$parent || $parent->get_status() !== 'publish' || get_post_field('post_password', $parent->get_id()) !== '') throw new CheckoutError('This product is unavailable.', 404);
        return ['id' => $product->get_id(), 'parent_id' => $product->is_type('variation') ? $parent->get_id() : null, 'type' => $product->get_type()];
    }
}
