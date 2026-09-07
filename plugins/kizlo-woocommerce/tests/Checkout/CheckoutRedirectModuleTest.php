<?php

namespace Kizlo\WooCommerce\Tests\Checkout;

use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\WooCommerce\Modules\Checkout\CheckoutRedirectModule;
use Kizlo\WooCommerce\Tests\TestCase;

class CheckoutRedirectModuleTest extends TestCase
{
    private const OPTION_ENABLED = 'kizlo_wc_checkout_redirect_enabled';

    private const OPTION_PATH = 'kizlo_wc_checkout_order_received_path';

    private const DEFAULT_URL = 'https://shop.example/checkout/order-received/42/?key=wc_order_abc';

    private CheckoutRedirectModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        $this->module = new CheckoutRedirectModule();
    }

    public function test_leaves_url_unchanged_when_toggle_is_off(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $order = wc_create_order();

        $this->assertSame(
            self::DEFAULT_URL,
            $this->module->redirectOrderReceivedUrl(self::DEFAULT_URL, $order),
        );
    }

    public function test_redirects_to_frontend_when_toggle_on_and_site_url_set(): void
    {
        update_option(self::OPTION_ENABLED, 'yes');
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $order = wc_create_order();

        $result = $this->module->redirectOrderReceivedUrl(self::DEFAULT_URL, $order);
        $parts  = wp_parse_url($result);
        parse_str($parts['query'] ?? '', $query);

        $this->assertSame('frontend.example', $parts['host']);
        $this->assertSame('/checkout/order-received/', $parts['path']);
        $this->assertSame((string) $order->get_id(), $query['order_id']);
        $this->assertSame($order->get_order_key(), $query['key']);
    }

    public function test_leaves_url_unchanged_when_toggle_on_but_no_site_url(): void
    {
        update_option(self::OPTION_ENABLED, 'yes');

        $this->assertNull(SiteSettings::load()->getUrl());

        $order = wc_create_order();

        $this->assertSame(
            self::DEFAULT_URL,
            $this->module->redirectOrderReceivedUrl(self::DEFAULT_URL, $order),
        );
    }

    public function test_honours_custom_path_and_normalises_slashes(): void
    {
        update_option(self::OPTION_ENABLED, 'yes');
        update_option(self::OPTION_PATH, '/custom/thank-you/');
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $order = wc_create_order();

        $result = $this->module->redirectOrderReceivedUrl(self::DEFAULT_URL, $order);

        $this->assertStringStartsWith('https://frontend.example/custom/thank-you/?', $result);
    }

    public function test_empty_path_falls_back_to_default(): void
    {
        update_option(self::OPTION_ENABLED, 'yes');
        update_option(self::OPTION_PATH, '');
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $order = wc_create_order();

        $result = $this->module->redirectOrderReceivedUrl(self::DEFAULT_URL, $order);

        $this->assertStringStartsWith('https://frontend.example/checkout/order-received/?', $result);
    }

    public function test_allows_frontend_host_when_enabled_and_site_url_set(): void
    {
        update_option(self::OPTION_ENABLED, 'yes');
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $hosts = $this->module->allowFrontendRedirectHost(['example.org']);

        $this->assertContains('frontend.example', $hosts);
        $this->assertContains('example.org', $hosts);
    }

    public function test_leaves_allowed_hosts_unchanged_when_toggle_off(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $this->assertSame(
            ['example.org'],
            $this->module->allowFrontendRedirectHost(['example.org']),
        );
    }

    public function test_save_persists_both_options(): void
    {
        $_POST[self::OPTION_ENABLED] = '1';
        $_POST[self::OPTION_PATH]    = '/custom/thank-you';

        $this->module->saveSettings();

        unset($_POST[self::OPTION_ENABLED], $_POST[self::OPTION_PATH]);

        $this->assertSame('yes', get_option(self::OPTION_ENABLED));
        $this->assertSame('/custom/thank-you', get_option(self::OPTION_PATH));
    }
}
