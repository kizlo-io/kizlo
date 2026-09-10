<?php

namespace Kizlo\WooCommerce\Modules\Checkout;

/**
 * Claims the WooCommerce order-pay page for WordPress-side rendering.
 *
 * The Kizlo Headless theme renders nothing and Headless Mode's frontend lockout
 * 404s public requests, but the order-pay page is a genuine WordPress-rendered
 * surface a shopper must load to see the pay form and its gateway assets. Both
 * gates honour the neutral `kizlo_headless_render_frontend` filter, so claiming it
 * here keeps the exception in WooCommerce and core WooCommerce-agnostic.
 *
 * The filter is read at `template_redirect` (lockout) and `template_include`
 * (theme); both run after the main query, so `is_checkout_pay_page()` is set up.
 */
class PayPageModule
{
    public function register(): void
    {
        add_filter('kizlo_headless_render_frontend', [$this, 'claimPayPage']);
    }

    /**
     * @param  bool $render Whether an earlier callback already claimed the request.
     * @return bool
     */
    public function claimPayPage(bool $render): bool
    {
        return $render || is_checkout_pay_page();
    }
}
