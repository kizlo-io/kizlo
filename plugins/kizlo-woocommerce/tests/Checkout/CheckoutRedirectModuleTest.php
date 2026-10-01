<?php

namespace Kizlo\WooCommerce\Tests\Checkout;

use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\WooCommerce\Modules\Checkout\CheckoutRedirectModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_Order;
use WP_REST_Request;
use WP_REST_Response;

class CheckoutRedirectModuleTest extends TestCase
{
    private const META_SUCCESS = '_kizlo_success_path';

    private const META_CANCEL = '_kizlo_cancel_path';

    private const SESSION_CONTEXT = '_kizlo_orderpay_redirect';

    private const RECEIVED_URL = 'https://shop.example/checkout/order-received/42/?key=wc_order_abc';

    private const CANCEL_URL = 'https://shop.example/cart/?cancel_order=true&order=wc_order_abc&order_id=42&redirect=&_wpnonce=abc';

    private const CART_URL = 'https://shop.example/cart/';

    private CheckoutRedirectModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        $this->module = new CheckoutRedirectModule();
    }

    protected function tearDown(): void
    {
        unset($_GET['key'], $GLOBALS['wp']->query_vars['order-pay']);
        WC()->session = null;

        parent::tearDown();
    }

    public function test_checkout_reports_a_paid_order_on_every_checkout_route(): void
    {
        $order = $this->orderWithStatus('processing');

        foreach (['/wc/store/v1/checkout', sprintf('/wc/store/v1/checkout/%d', $order->get_id())] as $route) {
            $this->assertTrue($this->kizloBlock($this->checkoutResponse($order->get_id()), $route)['is_paid'], $route);
        }
    }

    public function test_checkout_reports_an_on_hold_bank_transfer_order_as_unpaid(): void
    {
        $order = $this->orderWithStatus('on-hold', 'bacs');

        $block = $this->kizloBlock($this->checkoutResponse($order->get_id()), '/wc/store/v1/checkout');

        $this->assertFalse($block['is_paid']);
        $this->assertFalse($order->needs_payment(), 'needs_payment answers a different question, which is why is_paid exists');
    }

    public function test_checkout_believes_a_store_that_filters_the_paid_statuses(): void
    {
        add_filter('woocommerce_order_is_paid_statuses', static fn(array $statuses): array => [...$statuses, 'on-hold']);

        $order = $this->orderWithStatus('on-hold');

        $this->assertTrue($this->kizloBlock($this->checkoutResponse($order->get_id()), '/wc/store/v1/checkout')['is_paid']);
    }

    /**
     * The answer must survive the shape of the bag it is written into. WooCommerce
     * builds an object, a response filter would leave an array, and a bag missing
     * the namespace entirely must still be answered rather than skipped: reporting
     * a paid order as unpaid is the silence this field exists to remove.
     *
     * @dataProvider extensionBags
     */
    public function test_checkout_reports_the_paid_state_whatever_shape_the_bag_is(mixed $extensions): void
    {
        $order = $this->orderWithStatus('processing');

        $response = new WP_REST_Response(['order_id' => $order->get_id(), 'extensions' => $extensions]);

        $this->assertTrue($this->kizloBlock($response, '/wc/store/v1/checkout')['is_paid']);
    }

    /**
     * @return array<string, array{0: mixed}>
     */
    public static function extensionBags(): array
    {
        $kizlo = ['success_path' => '', 'cancel_path' => '', 'is_paid' => false];

        return [
            'object WooCommerce built'   => [(object) ['kizlo' => $kizlo]],
            'array a filter wrote'       => [['kizlo' => $kizlo]],
            'namespace absent'           => [(object) []],
            'bag absent'                 => [null],
        ];
    }

    public function test_checkout_keeps_the_redirect_placeholders_and_foreign_namespaces(): void
    {
        $order = $this->orderWithStatus('processing');

        $response = new WP_REST_Response([
            'order_id'   => $order->get_id(),
            'extensions' => (object) [
                'kizlo' => ['success_path' => '/thanks', 'cancel_path' => '/basket', 'is_paid' => false],
                'acme'  => ['opaque' => true],
            ],
        ]);

        $result     = $this->module->addCheckoutPaidState($response, null, new WP_REST_Request('GET', '/wc/store/v1/checkout'));
        $extensions = (array) $result->get_data()['extensions'];

        $this->assertSame(['opaque' => true], (array) $extensions['acme']);
        $this->assertSame(
            ['success_path' => '/thanks', 'cancel_path' => '/basket', 'is_paid' => true],
            (array) $extensions['kizlo'],
        );
    }

    public function test_the_checkout_draft_response_has_no_order_to_report(): void
    {
        $result = $this->module->addCheckoutPaidState(
            $this->checkoutResponse(0),
            null,
            new WP_REST_Request('GET', '/wc/store/v1/checkout'),
        );

        $this->assertSame(0, $result->get_data()['order_id']);
        $this->assertFalse($this->kizloBlock($this->checkoutResponse(0), '/wc/store/v1/checkout')['is_paid']);
    }

    public function test_a_non_checkout_route_keeps_the_placeholder(): void
    {
        $order = $this->orderWithStatus('processing');

        $this->assertFalse($this->kizloBlock($this->checkoutResponse($order->get_id()), '/wc/store/v1/cart')['is_paid']);
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

    /**
     * WooCommerce validates every extension property on the request, `readonly`
     * or not, and reads an omitted one as `null`. Run the real route arguments so
     * a storefront that sends only the redirect paths is accepted on both the
     * checkout and the order-pay retry.
     */
    public function test_checkout_accepts_redirect_paths_without_is_paid(): void
    {
        $value = ['kizlo' => ['success_path' => '/thanks', 'cancel_path' => '/basket']];

        foreach ($this->checkoutExtensionsArgs() as $route => $arg) {
            $request = new WP_REST_Request('POST', $route);

            $this->assertTrue($arg['validate_callback']($value, $request, 'extensions'), $route);
            $this->assertSame(
                ['success_path' => '/thanks', 'cancel_path' => '/basket', 'is_paid' => null],
                $arg['sanitize_callback']($value, $request, 'extensions')['kizlo'],
                $route,
            );
        }
    }

    /**
     * Paid is the order's answer, never the client's, so a claim is accepted and
     * thrown away.
     *
     * @dataProvider paidClaims
     */
    public function test_checkout_discards_a_client_paid_claim(bool $claim): void
    {
        $value = ['kizlo' => ['success_path' => '/thanks', 'cancel_path' => '/basket', 'is_paid' => $claim]];

        foreach ($this->checkoutExtensionsArgs() as $route => $arg) {
            $request = new WP_REST_Request('POST', $route);

            $this->assertTrue($arg['validate_callback']($value, $request, 'extensions'), $route);
            $this->assertNull($arg['sanitize_callback']($value, $request, 'extensions')['kizlo']['is_paid'], $route);
        }

        $order = $this->orderWithStatus('pending');
        $this->assertFalse($this->kizloBlock($this->checkoutResponse($order->get_id()), '/wc/store/v1/checkout')['is_paid']);
    }

    /**
     * @return array<string, array{0: bool}>
     */
    public static function paidClaims(): array
    {
        return [
            'true'  => [true],
            'false' => [false],
        ];
    }

    /**
     * WooCommerce type-checks the whole `kizlo` object against its schema before
     * any per-property callback runs, so a supplied value must still be a boolean.
     *
     * @dataProvider malformedPaidClaims
     */
    public function test_checkout_rejects_a_non_boolean_paid_claim(mixed $claim): void
    {
        $value = ['kizlo' => ['success_path' => '/thanks', 'cancel_path' => '/basket', 'is_paid' => $claim]];

        foreach ($this->checkoutExtensionsArgs() as $route => $arg) {
            $result = $arg['validate_callback']($value, new WP_REST_Request('POST', $route), 'extensions');

            $this->assertWPError($result, $route);
            $this->assertSame('rest_invalid_type', $result->get_error_code(), $route);
        }
    }

    /**
     * @return array<string, array{0: mixed}>
     */
    public static function malformedPaidClaims(): array
    {
        return [
            'string' => ['yes'],
            'array'  => [['paid' => true]],
        ];
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

    public function test_captures_order_pay_context_after_validating_id_and_key(): void
    {
        $this->startSession();
        $order = $this->orderWithCancelPath('/basket');

        $this->enterOrderPayPage($order->get_id(), $order->get_order_key());
        $this->module->captureOrderPayContext();

        $context = WC()->session->get(self::SESSION_CONTEXT);
        $this->assertSame($order->get_id(), $context['order_id']);
        $this->assertGreaterThan(time(), $context['expires']);
    }

    public function test_capture_rejects_a_mismatched_order_key(): void
    {
        $this->startSession();
        $order = $this->orderWithCancelPath('/basket');

        $this->enterOrderPayPage($order->get_id(), 'wc_order_wrong');
        $this->module->captureOrderPayContext();

        $this->assertNull(WC()->session->get(self::SESSION_CONTEXT));
    }

    public function test_capture_ignores_requests_off_the_order_pay_page(): void
    {
        $this->startSession();

        $this->module->captureOrderPayContext();

        $this->assertNull(WC()->session->get(self::SESSION_CONTEXT));
    }

    public function test_empty_checkout_redirect_uses_the_stored_cancel_path(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();
        $this->startSession();
        $order = $this->orderWithCancelPath('/basket');

        $this->enterOrderPayPage($order->get_id(), $order->get_order_key());
        $this->module->captureOrderPayContext();

        $this->assertTrue($this->module->redirectEmptyCheckoutToCancelPath(true));
        $this->assertSame('https://frontend.example/basket/', $this->filteredCartUrl());
    }

    public function test_empty_checkout_redirect_consumes_the_context_after_one_use(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();
        $this->startSession();
        $order = $this->orderWithCancelPath('/basket');
        $this->storeContext(['order_id' => $order->get_id(), 'expires' => time() + 60]);

        $this->module->redirectEmptyCheckoutToCancelPath(true);
        $this->assertSame('https://frontend.example/basket/', $this->filteredCartUrl());

        // The context is gone and the one-shot cart filter has removed itself.
        $this->assertNull(WC()->session->get(self::SESSION_CONTEXT));
        $this->assertTrue($this->module->redirectEmptyCheckoutToCancelPath(true));
        $this->assertSame(self::CART_URL, $this->filteredCartUrl());
    }

    public function test_empty_checkout_redirect_falls_back_when_the_order_has_no_cancel_path(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();
        $this->startSession();
        $order = wc_create_order();
        $this->storeContext(['order_id' => $order->get_id(), 'expires' => time() + 60]);

        $this->assertTrue($this->module->redirectEmptyCheckoutToCancelPath(true));
        $this->assertSame(self::CART_URL, $this->filteredCartUrl());
    }

    /**
     * @dataProvider unusableContexts
     * @param array<string, mixed>|null $context
     */
    public function test_empty_checkout_redirect_falls_back_for_unusable_context(?array $context): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();
        $this->startSession();

        if ($context !== null) {
            $this->storeContext($context);
        }

        $this->assertTrue($this->module->redirectEmptyCheckoutToCancelPath(true));
        $this->assertSame(self::CART_URL, $this->filteredCartUrl());
    }

    /**
     * @return array<string, array{0: array<string, mixed>|null}>
     */
    public static function unusableContexts(): array
    {
        return [
            'missing'   => [null],
            'expired'   => [['order_id' => 999, 'expires' => time() - 1]],
            'ambiguous' => [['ambiguous' => true, 'expires' => time() + 60]],
        ];
    }

    public function test_two_order_pay_pages_mark_the_context_ambiguous(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();
        $this->startSession();
        $first  = $this->orderWithCancelPath('/first');
        $second = $this->orderWithCancelPath('/second');

        $this->enterOrderPayPage($first->get_id(), $first->get_order_key());
        $this->module->captureOrderPayContext();
        $this->enterOrderPayPage($second->get_id(), $second->get_order_key());
        $this->module->captureOrderPayContext();

        $this->assertTrue(WC()->session->get(self::SESSION_CONTEXT)['ambiguous']);
        $this->assertTrue($this->module->redirectEmptyCheckoutToCancelPath(true));
        $this->assertSame(self::CART_URL, $this->filteredCartUrl());
    }

    public function test_empty_checkout_redirect_leaves_normal_cart_links_unchanged(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();
        $this->startSession();

        // No stored context: WooCommerce's cart URL is returned untouched.
        $this->module->redirectEmptyCheckoutToCancelPath(true);

        $this->assertSame(self::CART_URL, $this->filteredCartUrl());
    }

    public function test_empty_checkout_redirect_does_not_run_when_site_url_is_unset(): void
    {
        $this->assertNull(SiteSettings::load()->getUrl());
        $this->startSession();
        $order = $this->orderWithCancelPath('/basket');
        $this->storeContext(['order_id' => $order->get_id(), 'expires' => time() + 60]);

        $this->assertTrue($this->module->redirectEmptyCheckoutToCancelPath(true));
        $this->assertSame(self::CART_URL, $this->filteredCartUrl());
    }

    public function test_empty_checkout_redirect_leaves_the_order_status_untouched(): void
    {
        SiteSettings::load()->setUrl('https://frontend.example')->save();
        $this->startSession();
        $order = $this->orderWithCancelPath('/basket');
        $order->set_status('pending');
        $order->save();
        $this->storeContext(['order_id' => $order->get_id(), 'expires' => time() + 60]);

        $this->module->redirectEmptyCheckoutToCancelPath(true);

        $this->assertSame('pending', wc_get_order($order->get_id())->get_status());
    }

    private function startSession(): \WC_Session_Handler
    {
        $session      = new \WC_Session_Handler();
        WC()->session = $session;

        return $session;
    }

    private function orderWithCancelPath(string $path): WC_Order
    {
        $order = wc_create_order();
        $order->update_meta_data(self::META_CANCEL, $path);
        $order->save();

        return $order;
    }

    /**
     * Stand on the WooCommerce order-pay page for one order without a full
     * front-end request: force the checkout conditional, set the endpoint query
     * var, and supply the order key the page reads from the request.
     */
    private function enterOrderPayPage(int $orderId, string $key): void
    {
        add_filter('woocommerce_is_checkout', '__return_true');
        $GLOBALS['wp']->query_vars['order-pay'] = $orderId;
        $_GET['key']                            = $key;
    }

    /**
     * @param array<string, mixed> $context
     */
    private function storeContext(array $context): void
    {
        WC()->session->set(self::SESSION_CONTEXT, $context);
    }

    private function filteredCartUrl(string $original = self::CART_URL): string
    {
        return (string) apply_filters('woocommerce_get_cart_url', $original);
    }

    /**
     * A checkout response shaped the way WooCommerce builds it: an array carrying
     * `order_id`, with the extension namespaces cast to an object by
     * `ExtendSchema::get_endpoint_data()` and `kizlo` holding the real data
     * callback's placeholders.
     */
    private function checkoutResponse(int $orderId): WP_REST_Response
    {
        return new WP_REST_Response([
            'order_id'   => $orderId,
            'extensions' => (object) ['kizlo' => $this->module->checkoutExtensionData()],
        ]);
    }

    /**
     * The `kizlo` block the filter leaves behind, read shape-agnostically so the
     * assertions describe the answer rather than how the bag happens to be encoded.
     *
     * @return array<string, mixed>
     */
    private function kizloBlock(WP_REST_Response $response, string $route, string $method = 'GET'): array
    {
        $result = $this->module->addCheckoutPaidState($response, null, new WP_REST_Request($method, $route));
        $data   = (array) $result->get_data();

        return (array) ((array) $data['extensions'])['kizlo'];
    }

    private function orderWithStatus(string $status, string $paymentMethod = ''): WC_Order
    {
        $order = wc_create_order();
        if ($paymentMethod !== '') $order->set_payment_method($paymentMethod);
        $order->set_status($status);
        $order->save();

        return $order;
    }

    /**
     * The `extensions` argument WooCommerce registers on each POST checkout route,
     * keyed by route, carrying its recursive validate and sanitize callbacks.
     *
     * @return array<string, array<string, mixed>>
     */
    private function checkoutExtensionsArgs(): array
    {
        $this->module->extendCheckoutSchema();
        $this->bootRestServer();

        $args = [];
        foreach (rest_get_server()->get_routes() as $route => $handlers) {
            if (! str_starts_with($route, '/wc/store/v1/checkout')) continue;

            foreach ($handlers as $handler) {
                if (isset($handler['methods']['POST'], $handler['args']['extensions'])) $args[$route] = $handler['args']['extensions'];
            }
        }

        $this->assertCount(2, $args, 'the checkout and the order-pay retry');

        return $args;
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
