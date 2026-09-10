<?php

namespace Kizlo\WooCommerce\Tests\Checkout;

use Kizlo\WooCommerce\Modules\Checkout\PayPageModule;
use Kizlo\WooCommerce\Tests\TestCase;

class PayPageModuleTest extends TestCase
{
    private PayPageModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        $this->module = new PayPageModule();
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['wp']->query_vars['order-pay']);

        parent::tearDown();
    }

    /**
     * `is_checkout_pay_page()` is `is_checkout() && ! empty($wp->query_vars['order-pay'])`.
     * Force the checkout conditional and set the endpoint query var to stand on the
     * order-pay page without a full front-end request.
     */
    private function enterOrderPayPage(): void
    {
        add_filter('woocommerce_is_checkout', '__return_true');
        $GLOBALS['wp']->query_vars['order-pay'] = 42;
    }

    public function test_claims_the_frontend_on_the_order_pay_page(): void
    {
        $this->enterOrderPayPage();

        $this->assertTrue($this->module->claimPayPage(false));
    }

    public function test_does_not_claim_the_frontend_on_an_ordinary_page(): void
    {
        $this->assertFalse($this->module->claimPayPage(false));
    }

    public function test_preserves_an_earlier_claim_off_the_pay_page(): void
    {
        $this->assertTrue($this->module->claimPayPage(true));
    }

    public function test_register_wires_the_render_filter_and_it_reads_true_on_the_pay_page(): void
    {
        $this->module->register();

        $this->assertFalse((bool) apply_filters('kizlo_headless_render_frontend', false));

        $this->enterOrderPayPage();

        $this->assertTrue((bool) apply_filters('kizlo_headless_render_frontend', false));
    }
}
