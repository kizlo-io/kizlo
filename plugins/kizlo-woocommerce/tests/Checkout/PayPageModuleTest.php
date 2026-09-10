<?php

namespace Kizlo\WooCommerce\Tests\Checkout;

use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\WooCommerce\Modules\Checkout\PayPageModule;
use Kizlo\WooCommerce\Tests\TestCase;

class PayPageModuleTest extends TestCase
{
    private const FRAMING_ACTION = 'wc_send_frame_options_header';

    private PayPageModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        $this->module = new PayPageModule();
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['wp']->query_vars['order-pay']);
        remove_action('template_redirect', self::FRAMING_ACTION);

        parent::tearDown();
    }

    /**
     * `is_checkout_pay_page()` is `is_checkout() && ! empty($wp->query_vars['order-pay'])`.
     * Force the checkout conditional and set the endpoint query var to stand on the
     * order-pay page without a full front-end request.
     */
    private function enterOrderPayPage(int $orderId = 42): void
    {
        add_filter('woocommerce_is_checkout', '__return_true');
        $GLOBALS['wp']->query_vars['order-pay'] = $orderId;
    }

    /**
     * WooCommerce's checkout framing protection, represented by the callback the fix
     * removes. Register it explicitly so the assertions do not depend on whether the
     * loaded WooCommerce build has already wired it for this request.
     */
    private function givenWooCommerceFramingProtection(): void
    {
        if (has_action('template_redirect', self::FRAMING_ACTION) === false) {
            add_action('template_redirect', self::FRAMING_ACTION);
        }
    }

    private function assertFramingProtectionRegistered(): void
    {
        $this->assertNotFalse(
            has_action('template_redirect', self::FRAMING_ACTION),
            'WooCommerce framing protection should remain registered.',
        );
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

    public function test_register_wires_the_framing_guard_before_woocommerce(): void
    {
        $this->module->register();

        // Priority 5 is earlier than WooCommerce's default priority 10, so removing
        // its callback lands before it would emit the same-origin policy.
        $this->assertSame(5, has_action('template_redirect', [$this->module, 'allowTrustedStorefrontFraming']));
    }

    public function test_valid_site_url_produces_the_exact_frame_ancestors_policy(): void
    {
        $this->assertSame(
            "frame-ancestors 'self' https://storefront.example",
            $this->module->trustedFrameAncestorsPolicy('https://storefront.example'),
        );
    }

    public function test_site_url_path_and_query_are_dropped_while_the_port_is_kept(): void
    {
        $this->assertSame(
            "frame-ancestors 'self' http://localhost:3000",
            $this->module->trustedFrameAncestorsPolicy('HTTP://Localhost:3000/store/pay?order=1#top'),
        );
    }

    /**
     * @dataProvider unusableSiteUrls
     */
    public function test_missing_or_invalid_site_urls_have_no_policy(?string $url): void
    {
        $this->assertNull($this->module->trustedFrameAncestorsPolicy($url));
    }

    /**
     * @return array<string, array{0: ?string}>
     */
    public static function unusableSiteUrls(): array
    {
        return [
            'null'              => [null],
            'empty'             => [''],
            'whitespace'        => ['   '],
            'no scheme'         => ['//storefront.example'],
            'unsupported scheme'=> ['ftp://storefront.example'],
            'javascript scheme' => ['javascript:alert(1)'],
            'not a url'         => ['not a url'],
        ];
    }

    public function test_pay_page_with_a_site_url_relaxes_framing_protection(): void
    {
        SiteSettings::load()->setUrl('https://storefront.example')->save();
        $this->givenWooCommerceFramingProtection();
        $this->assertFramingProtectionRegistered();

        $this->enterOrderPayPage();
        $this->module->allowTrustedStorefrontFraming();

        $this->assertFalse(
            has_action('template_redirect', self::FRAMING_ACTION),
            'A configured storefront should drop WooCommerce same-origin framing on the pay page.',
        );
    }

    public function test_pay_page_without_a_site_url_keeps_framing_protection(): void
    {
        $this->assertNull(SiteSettings::load()->getUrl());
        $this->givenWooCommerceFramingProtection();

        $this->enterOrderPayPage();
        $this->module->allowTrustedStorefrontFraming();

        $this->assertFramingProtectionRegistered();
    }

    public function test_ordinary_checkout_page_keeps_framing_protection(): void
    {
        SiteSettings::load()->setUrl('https://storefront.example')->save();
        $this->givenWooCommerceFramingProtection();

        // On checkout but not the order-pay endpoint.
        add_filter('woocommerce_is_checkout', '__return_true');
        $this->module->allowTrustedStorefrontFraming();

        $this->assertFramingProtectionRegistered();
    }

    public function test_unrelated_page_keeps_framing_protection(): void
    {
        SiteSettings::load()->setUrl('https://storefront.example')->save();
        $this->givenWooCommerceFramingProtection();

        $this->module->allowTrustedStorefrontFraming();

        $this->assertFramingProtectionRegistered();
    }

    /**
     * Drive the wired hook against a real pending order's pay-page context: the guard
     * relaxes framing only for the configured origin, and leaves WooCommerce's
     * protection in place when no Site URL is set.
     */
    public function test_real_order_pay_page_permits_only_the_configured_storefront(): void
    {
        $order = wc_create_order();
        $order->set_status('pending');
        $order->save();

        $this->module->register();
        $this->givenWooCommerceFramingProtection();
        $this->enterOrderPayPage($order->get_id());

        // No Site URL: WooCommerce's protection stays.
        $this->module->allowTrustedStorefrontFraming();
        $this->assertFramingProtectionRegistered();

        // Configured Site URL: the order-pay response now permits that origin.
        SiteSettings::load()->setUrl('https://storefront.example')->save();
        $this->module->allowTrustedStorefrontFraming();

        $this->assertFalse(has_action('template_redirect', self::FRAMING_ACTION));
        $this->assertSame(
            "frame-ancestors 'self' https://storefront.example",
            $this->module->trustedFrameAncestorsPolicy(get_option('kizlo_settings_site')['url'] ?? null),
        );
    }
}
