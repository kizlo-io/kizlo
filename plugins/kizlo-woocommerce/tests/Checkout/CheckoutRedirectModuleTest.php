<?php

namespace Kizlo\WooCommerce\Tests\Checkout;

use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\WooCommerce\Modules\Checkout\CheckoutRedirectModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WP_REST_Request;

class CheckoutRedirectModuleTest extends TestCase
{
    private const META_SUCCESS = '_kizlo_success_path';

    private const META_CANCEL = '_kizlo_cancel_path';

    private const RECEIVED_URL = 'https://shop.example/checkout/order-received/42/?key=wc_order_abc';

    private const CANCEL_URL = 'https://shop.example/cart/?cancel_order=true&order=wc_order_abc&order_id=42&redirect=&_wpnonce=abc';

    private CheckoutRedirectModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        $this->module = new CheckoutRedirectModule();
    }

    public function test_captures_relative_paths_from_the_request_extension(): void
    {
        $order = wc_create_order();

        $this->module->captureRedirectPaths($order, $this->requestWithKizlo([
            'success_path' => '/thanks',
            'cancel_path'  => '/basket',
        ]));

        $saved = wc_get_order($order->get_id());
        $this->assertSame('/thanks', $saved->get_meta(self::META_SUCCESS));
        $this->assertSame('/basket', $saved->get_meta(self::META_CANCEL));
    }

    public function test_success_redirect_uses_the_stored_path(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $order = wc_create_order();
        $order->update_meta_data(self::META_SUCCESS, '/thanks');
        $order->save();

        $result = $this->module->redirectOrderReceivedUrl(self::RECEIVED_URL, $order);
        $parts  = wp_parse_url($result);
        parse_str($parts['query'] ?? '', $query);

        $this->assertSame('frontend.example', $parts['host']);
        $this->assertSame('/thanks/', $parts['path']);
        $this->assertSame((string) $order->get_id(), $query['order_id']);
        $this->assertSame($order->get_order_key(), $query['key']);
    }

    public function test_success_redirect_falls_back_to_the_default_path(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $order = wc_create_order();

        $result = $this->module->redirectOrderReceivedUrl(self::RECEIVED_URL, $order);

        $this->assertStringStartsWith('https://frontend.example/checkout/order-received/?', $result);
    }

    public function test_cancel_redirect_points_at_the_stored_path(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $order = wc_create_order();
        $order->update_meta_data(self::META_CANCEL, '/basket');
        $order->save();

        $result = $this->module->redirectCancelOrderUrl(self::CANCEL_URL, $order, '');
        parse_str(wp_parse_url($result, PHP_URL_QUERY) ?? '', $query);

        $this->assertSame('https://frontend.example/basket/', $query['redirect']);
        $this->assertSame('true', $query['cancel_order']);
    }

    public function test_cancel_redirect_falls_back_to_the_default_path(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $order = wc_create_order();

        $result = $this->module->redirectCancelOrderUrl(self::CANCEL_URL, $order, '');
        parse_str(wp_parse_url($result, PHP_URL_QUERY) ?? '', $query);

        $this->assertSame('https://frontend.example/cart/', $query['redirect']);
    }

    /**
     * @dataProvider offSitePaths
     */
    public function test_capture_rejects_a_non_relative_path(string $path): void
    {
        $order = wc_create_order();

        $this->module->captureRedirectPaths($order, $this->requestWithKizlo([
            'success_path' => $path,
            'cancel_path'  => $path,
        ]));

        $saved = wc_get_order($order->get_id());
        $this->assertSame('', $saved->get_meta(self::META_SUCCESS));
        $this->assertSame('', $saved->get_meta(self::META_CANCEL));
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function offSitePaths(): array
    {
        return [
            'absolute scheme'         => ['https://evil.example/steal'],
            'protocol relative'       => ['//evil.example/steal'],
            'backslash protocol'      => ['/\\evil.example/steal'],
            'no leading slash'        => ['checkout/order-received'],
        ];
    }

    public function test_no_redirect_when_site_url_is_unset(): void
    {
        $this->assertNull(SiteSettings::load()->getUrl());

        $order = wc_create_order();
        $order->update_meta_data(self::META_SUCCESS, '/thanks');
        $order->update_meta_data(self::META_CANCEL, '/basket');
        $order->save();

        $this->assertSame(self::RECEIVED_URL, $this->module->redirectOrderReceivedUrl(self::RECEIVED_URL, $order));
        $this->assertSame(self::CANCEL_URL, $this->module->redirectCancelOrderUrl(self::CANCEL_URL, $order, ''));
        $this->assertSame(['example.org'], $this->module->allowFrontendRedirectHost(['example.org']));
    }

    public function test_allows_the_frontend_host_when_site_url_is_set(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();

        $hosts = $this->module->allowFrontendRedirectHost(['example.org']);

        $this->assertContains('frontend.example', $hosts);
        $this->assertContains('example.org', $hosts);
    }

    /**
     * @param array<string, mixed> $kizlo
     */
    private function requestWithKizlo(array $kizlo): WP_REST_Request
    {
        $request = new WP_REST_Request('POST', '/wc/store/v1/checkout');
        $request->set_param('extensions', ['kizlo' => $kizlo]);

        return $request;
    }
}
