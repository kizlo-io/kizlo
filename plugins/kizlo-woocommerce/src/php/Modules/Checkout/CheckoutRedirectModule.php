<?php

namespace Kizlo\WooCommerce\Modules\Checkout;

use Automattic\WooCommerce\StoreApi\Schemas\V1\CheckoutSchema;
use Kizlo\Modules\Settings\Settings;
use Kizlo\Support\Utils;
use Kizlo\WooCommerce\Modules\Contract\KizloBlocks;
use WC_Order;
use WP_REST_Request;

/**
 * Redirect the shopper to the headless frontend after checkout, to a success or
 * cancel path chosen per checkout by the storefront rather than by a global
 * setting. The frontend sends relative `success_path`/`cancel_path` in
 * `extensions.kizlo` when confirming or retrying checkout; they are stamped on
 * the order and read back when WooCommerce builds each redirect. Everything is
 * gated on a configured Kizlo Site URL.
 */
class CheckoutRedirectModule
{
    private const META_SUCCESS = '_kizlo_success_path';

    private const META_CANCEL = '_kizlo_cancel_path';

    private const DEFAULT_SUCCESS_PATH = '/checkout/order-received';

    private const DEFAULT_CANCEL_PATH = '/cart';

    public function register(): void
    {
        add_action('woocommerce_blocks_loaded', [$this, 'extendCheckoutSchema'], PHP_INT_MAX);
        add_action('woocommerce_store_api_checkout_update_order_from_request', [$this, 'captureRedirectPaths'], 10, 2);
        add_filter('woocommerce_get_checkout_order_received_url', [$this, 'redirectOrderReceivedUrl'], 10, 2);
        add_filter('woocommerce_get_cancel_order_url_raw', [$this, 'redirectCancelOrderUrl'], 10, 3);
        add_filter('woocommerce_get_cancel_order_url', [$this, 'redirectCancelOrderUrl'], 10, 3);
        add_filter('allowed_redirect_hosts', [$this, 'allowFrontendRedirectHost']);
    }

    /**
     * Register the `kizlo` extension on the Store API checkout endpoint so a
     * request may carry `extensions.kizlo.success_path`/`cancel_path`. Mirrors
     * {@see \Kizlo\WooCommerce\Modules\Cart\CartModule::extendShopApiCartSchema}.
     */
    public function extendCheckoutSchema(): void
    {
        woocommerce_store_api_register_endpoint_data([
            'namespace'       => 'kizlo',
            'endpoint'        => CheckoutSchema::IDENTIFIER,
            'data_callback'   => [$this, 'checkoutExtensionData'],
            'schema_callback' => [KizloBlocks::class, 'storeCheckout'],
            'schema_type'     => ARRAY_A,
        ]);
    }

    /**
     * The checkout response's `extensions.kizlo`. The redirect paths are
     * write-only transport, so nothing is echoed back; registering the endpoint
     * data is what lets the request carry them for {@see captureRedirectPaths}.
     *
     * @return array<string, string>
     */
    public function checkoutExtensionData(): array
    {
        return [
            'success_path' => '',
            'cancel_path'  => '',
        ];
    }

    /**
     * Stamp the storefront-supplied redirect paths on the order as it is built
     * from a checkout or retry request. Invalid (non-relative) paths are dropped
     * so the redirect falls back to its default. Fires for both the checkout
     * POST and the order-pay retry route via WooCommerce's shared checkout trait.
     */
    public function captureRedirectPaths(mixed $order, mixed $request): void
    {
        if (! $order instanceof WC_Order) return;
        if (! $request instanceof WP_REST_Request) return;

        $extensions = $request->get_param('extensions');
        if (! is_array($extensions) || ! isset($extensions['kizlo']) || ! is_array($extensions['kizlo'])) {
            return;
        }

        $kizlo   = $extensions['kizlo'];
        $changed = false;

        foreach ([self::META_SUCCESS => 'success_path', self::META_CANCEL => 'cancel_path'] as $meta => $key) {
            if (! array_key_exists($key, $kizlo)) continue;

            $path = self::sanitizePath((string) $kizlo[$key]);
            if ($path === null) continue;

            $order->update_meta_data($meta, $path);
            $changed = true;
        }

        if ($changed) $order->save();
    }

    /**
     * @param  string   $url
     * @param  WC_Order $order
     * @return string
     */
    public function redirectOrderReceivedUrl(string $url, WC_Order $order): string
    {
        $settings = $this->frontendSettings();

        if ($settings === null) {
            return $url;
        }

        $path = $this->orderPath($order, self::META_SUCCESS, self::DEFAULT_SUCCESS_PATH);

        return add_query_arg([
            'order_id' => $order->get_id(),
            'key'      => $order->get_order_key(),
        ], $settings->resolveUrl($settings->getBaseUrl(), $path));
    }

    /**
     * Point WooCommerce's cancel-order endpoint at the frontend cancel path. The
     * endpoint still cancels the order and frees stock; only where it lands the
     * shopper afterwards changes, by rewriting the `redirect` query arg.
     *
     * @param  string $url
     * @param  mixed  $order
     * @param  string $redirect
     * @return string
     */
    public function redirectCancelOrderUrl(string $url, mixed $order, string $redirect): string
    {
        $settings = $this->frontendSettings();

        if ($settings === null || ! $order instanceof WC_Order) {
            return $url;
        }

        $path = $this->orderPath($order, self::META_CANCEL, self::DEFAULT_CANCEL_PATH);

        return add_query_arg('redirect', $settings->resolveUrl($settings->getBaseUrl(), $path), $url);
    }

    /**
     * WooCommerce sends off-site gateway returns to the order-received URL with
     * wp_safe_redirect(), which rejects any host outside allowed_redirect_hosts.
     * Add the headless frontend host so a cross-host redirect is not blocked.
     *
     * @param  array<int, string> $hosts
     * @return array<int, string>
     */
    public function allowFrontendRedirectHost(array $hosts): array
    {
        $settings = $this->frontendSettings();

        if ($settings === null) {
            return $hosts;
        }

        $host = wp_parse_url($settings->getBaseUrl(), PHP_URL_HOST);

        if (is_string($host) && $host !== '') {
            $hosts[] = $host;
        }

        return $hosts;
    }

    /**
     * The stored path for an order, sanitized, or the default when it is missing
     * or not a valid relative path.
     */
    private function orderPath(WC_Order $order, string $metaKey, string $default): string
    {
        $meta = $order->get_meta($metaKey);
        $path = is_string($meta) ? self::sanitizePath($meta) : null;

        return $path ?? $default;
    }

    /**
     * A relative path safe to resolve against the Site URL, or null. Open-redirect
     * protection: it must start with a single `/`, so a scheme (`https:`) or a
     * protocol-relative `//host` (or its `/\host` variant) cannot point off-site.
     */
    private static function sanitizePath(string $path): ?string
    {
        $path = trim($path);

        if ($path === '' || $path[0] !== '/') {
            return null;
        }

        if (isset($path[1]) && ($path[1] === '/' || $path[1] === '\\')) {
            return null;
        }

        return $path;
    }

    /**
     * The Kizlo settings when a frontend Site URL is configured, or null.
     * getBaseUrl() otherwise falls back to the WordPress home URL, which is not
     * headless, so a missing Site URL means no redirect.
     */
    private function frontendSettings(): ?Settings
    {
        $settings = Utils::getSettings();

        return $settings->site->getUrl() === null ? null : $settings;
    }
}
