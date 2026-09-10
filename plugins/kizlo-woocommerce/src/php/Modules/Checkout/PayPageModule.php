<?php

namespace Kizlo\WooCommerce\Modules\Checkout;

use Kizlo\Support\Utils;

/**
 * Claims the WooCommerce order-pay page for WordPress-side rendering, and lets a
 * configured headless storefront embed it.
 *
 * The Kizlo Headless theme renders nothing and Headless Mode's frontend lockout
 * 404s public requests, but the order-pay page is a genuine WordPress-rendered
 * surface a shopper must load to see the pay form and its gateway assets. Both
 * gates honour the neutral `kizlo_headless_render_frontend` filter, so claiming it
 * here keeps the exception in WooCommerce and core WooCommerce-agnostic.
 *
 * WooCommerce also protects checkout responses with `X-Frame-Options: SAMEORIGIN`
 * and `Content-Security-Policy: frame-ancestors 'self'`, which stops a storefront
 * on a different origin from presenting the pay page in a modal iframe. When a
 * Kizlo Site URL is configured, the order-pay response is relabelled to permit
 * that one extra origin; every other response keeps WooCommerce's protection.
 *
 * The filter is read at `template_redirect` (lockout) and `template_include`
 * (theme); both run after the main query, so `is_checkout_pay_page()` is set up.
 */
class PayPageModule
{
    public function register(): void
    {
        add_filter('kizlo_headless_render_frontend', [$this, 'claimPayPage']);
        add_action('template_redirect', [$this, 'allowTrustedStorefrontFraming'], 5);
    }

    /**
     * @param  bool $render Whether an earlier callback already claimed the request.
     * @return bool
     */
    public function claimPayPage(bool $render): bool
    {
        return $render || is_checkout_pay_page();
    }

    /**
     * Relabel the order-pay response so the configured storefront origin may frame
     * it. Runs before WooCommerce's priority-10 `wc_send_frame_options_header` so
     * removing that callback stops the same-origin policy from being emitted at all.
     */
    public function allowTrustedStorefrontFraming(): void
    {
        if (! is_checkout_pay_page()) {
            return;
        }

        $policy = $this->trustedFrameAncestorsPolicy(Utils::getSettings()->site->getUrl());

        if ($policy === null) {
            return;
        }

        remove_action('template_redirect', 'wc_send_frame_options_header');

        if (headers_sent()) {
            return;
        }

        // X-Frame-Options has no multi-origin syntax, so drop it and rely on the CSP.
        header_remove('X-Frame-Options');
        header('Content-Security-Policy: ' . $policy);
    }

    /**
     * The `frame-ancestors` policy permitting the storefront to frame the pay page,
     * or null when no usable http(s) Site URL is configured. The Site URL is reduced
     * to a bare origin (scheme + host + optional port); its path, query, fragment,
     * and any userinfo are dropped.
     */
    public function trustedFrameAncestorsPolicy(?string $url): ?string
    {
        if (! is_string($url) || trim($url) === '') {
            return null;
        }

        $parts  = wp_parse_url($url);
        $scheme = is_array($parts) && isset($parts['scheme']) ? strtolower($parts['scheme']) : '';
        $host   = is_array($parts) && isset($parts['host']) ? strtolower($parts['host']) : '';

        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return null;
        }

        $origin = "{$scheme}://{$host}";

        if (isset($parts['port'])) {
            $origin .= ':' . $parts['port'];
        }

        return "frame-ancestors 'self' {$origin}";
    }
}
