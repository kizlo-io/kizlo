<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

use Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema;
use Automattic\WooCommerce\StoreApi\SchemaController;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Kizlo\WooCommerce\Modules\Cart\CartMerger;
use Kizlo\WooCommerce\Modules\Cart\CartSerializer;
use WC_Cart;
use WP_Error;
use WP_HTTP_Response;
use WP_REST_Request;

/** Bootstraps the request-scoped headless WooCommerce session adapter. */
class WooCommerceModule
{
    private bool $trustedAdminAuth = false;
    private ?int $headlessRequestId = null;
    private ?int $initializingRequestId = null;
    private ?int $initializedRequestId = null;

    public function register(): void
    {
        WooCommerceSchemas::register();

        add_filter('kizlo_rest_route_requires_admin', [$this, 'requiresKizloAdmin'], 10, 2);
        add_filter('woocommerce_session_handler', [$this, 'maybeUseHeadlessSession']);
        add_filter('woocommerce_persistent_cart_enabled', [$this, 'maybeDisablePersistentCart']);
        add_filter('woocommerce_store_api_disable_nonce_check', [$this, 'maybeDisableNonceCheck']);
        add_filter('rest_post_dispatch', [$this, 'addCheckoutDraftCart'], 10, 3);
        add_filter('rest_post_dispatch', [$this, 'addCartTokenHeader'], 10, 3);
        add_filter('rest_request_before_callbacks', [$this, 'maybeSwitchStoreApiUser'], 10, 3);

        // Global (not headless-request-scoped) so an off-session gateway
        // webhook/IPN that completes payment can still reach the owning cart.
        add_action('woocommerce_store_api_checkout_order_processed', [$this, 'captureOrderSessionKey']);
        add_action('woocommerce_order_status_changed', [$this, 'clearCartForPaidOrder'], 10, 4);
    }

    /**
     * Guard Kizlo's headless surface (the whole Store API) and defer every
     * other WooCommerce route to WooCommerce's own capability checks, so the
     * admin dashboard's cookie-authenticated REST calls are not blocked.
     */
    public function requiresKizloAdmin(bool $required, WP_REST_Request $request): bool
    {
        $route = $request->get_route();
        if (str_starts_with($route, '/wc/store/')) return true;
        if ($this->isWooCommerceRoute($route)) return false;

        return $required;
    }

    public function maybeUseHeadlessSession(string $default): string
    {
        return $this->headlessRequestId !== null ? SessionHandler::class : $default;
    }

    public function maybeDisablePersistentCart(bool $enabled): bool
    {
        return $this->headlessRequestId !== null ? false : $enabled;
    }

    public function maybeDisableNonceCheck(bool $disabled): bool
    {
        if ($disabled) return true;
        return $this->headlessRequestId !== null && $this->trustedAdminAuth;
    }

    /**
     * A GET /checkout serializes its order through CheckoutSchema without the
     * per-request cart calculation `/cart` runs, so `__experimentalCart` comes
     * back either null or a cart with empty `shipping_rates`. It is null for a
     * pending or failed order the route keeps returning while its payment is
     * still outstanding (returning to checkout after starting an online
     * payment), and a non-null but shipping-less cart for the checkout-draft the
     * route rebuilds (WooCommerce 10.9+ defers draft creation until checkout
     * POST, so a POST that fails after materialising the draft leaves the next
     * GET reading the saved order). In both cases the route only ever hands back
     * that order while its cart hash still matches the live cart, so WC()->cart
     * is the cart behind it. Rebuild `__experimentalCart` through the same
     * `get_cart_for_response()` builder `/cart` uses so the checkout resource
     * carries priced shipping packages without a second Store API request. That
     * builder's `did_action('woocommerce_after_calculate_totals')` guard makes
     * the calculation idempotent, so overwriting whatever WooCommerce embedded
     * costs nothing when totals were already calculated this request.
     */
    public function addCheckoutDraftCart(mixed $response, mixed $server, mixed $request): mixed
    {
        if (! $response instanceof WP_HTTP_Response) return $response;
        if (! $request instanceof WP_REST_Request) return $response;
        if ($request->get_method() !== 'GET' || $request->get_route() !== '/wc/store/v1/checkout') return $response;
        if ($response->get_status() >= 400) return $response;

        $data = $response->get_data();
        if (! is_array($data)) return $response;
        if (! in_array($data['status'] ?? null, ['checkout-draft', 'pending', 'failed'], true)) return $response;
        // @phpstan-ignore instanceof.alwaysTrue
        if (! WC()->cart instanceof WC_Cart) return $response;
        $schema = StoreApi::container()->get(SchemaController::class)->get(CartSchema::IDENTIFIER);
        if (! $schema instanceof CartSchema) return $response;

        $cart                       = CartSerializer::cart_controller()->get_cart_for_response();
        $data['__experimentalCart'] = (object) $schema->get_item_response($cart);
        $response->set_data($data);

        return $response;
    }

    /**
     * Record which headless session owns a checkout order. A logged-in order
     * could be found again from its customer id, but a guest order keeps only a
     * "t_" session token that is never written to the order, so stamp the key on
     * every headless order and read it back when payment later completes —
     * possibly off-session, from a gateway webhook with no request headers.
     */
    public function captureOrderSessionKey(mixed $order): void
    {
        if (! $order instanceof \WC_Order) return;

        $session = WC()->session;
        if (! $session instanceof SessionHandler) return;

        $key = $session->get_customer_id();
        if ($key === '') return;

        $order->update_meta_data('_kizlo_session_key', $key);
        $order->save();
    }

    /**
     * Empty the owning cart once an order reaches a paid status. Online gateways
     * leave the order pending with the cart live so an abandoned payment returns
     * to a populated cart; nothing in a headless flow runs the storefront's
     * post-payment step that clears it. Keyed only off the session stamped at
     * checkout, so a non-headless order transitioning never touches a cart.
     */
    public function clearCartForPaidOrder(int $orderId, string $from, string $to, mixed $order): void
    {
        if (! in_array($to, wc_get_is_paid_statuses(), true)) return;
        if (! $order instanceof \WC_Order) return;

        $key = (string) $order->get_meta('_kizlo_session_key');
        if ($key === '') return;

        $this->clearSessionCart($key);
    }

    /**
     * Clear a session's cart and its Store API draft-order reference. When the
     * owning session is the live one (the in-session retry route), empty it
     * through WooCommerce so the shutdown save persists the change; otherwise
     * (an off-session webhook) rewrite the session row directly.
     */
    private function clearSessionCart(string $key): void
    {
        $session = WC()->session;
        // @phpstan-ignore instanceof.alwaysTrue
        if ($session instanceof \WC_Session && $session->get_customer_id() === $key) {
            $cart = WC()->cart;
            // @phpstan-ignore instanceof.alwaysTrue
            if ($cart instanceof \WC_Cart) $cart->empty_cart();
            $session->set('store_api_draft_order', null);
            return;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'woocommerce_sessions';

        $value = $wpdb->get_var(
            $wpdb->prepare('SELECT session_value FROM %i WHERE session_key = %s', $table, $key)
        );
        if ($value === null) return;

        $data = maybe_unserialize($value);
        if (! is_array($data)) return;

        unset($data['cart'], $data['store_api_draft_order']);

        $wpdb->update($table, ['session_value' => maybe_serialize($data)], ['session_key' => $key]);
        wp_cache_delete($key, 'wc_session_id');
    }

    /**
     * Validate and initialize only cart, checkout and order Store API requests,
     * before WooCommerce checks route permissions. The object id makes repeated
     * filter passes for one request harmless.
     *
     * WordPress has already run rest_authentication_errors at this point, so
     * Kizlo's global guard has verified the App Password administrator. Store
     * API permission callbacks now see the resolved customer and can authorize
     * registered orders against the identity in X-Kizlo-User-Email.
     */
    public function maybeSwitchStoreApiUser(mixed $response, mixed $handler, mixed $request): mixed
    {
        if (is_wp_error($response)) return $response;
        if (! $request instanceof WP_REST_Request) return $response;

        $route = $request->get_route();
        if (! $this->isHeadlessStoreRoute($route)) return $response;

        $requestId = spl_object_id($request);
        if ($this->initializedRequestId === $requestId || $this->initializingRequestId === $requestId) {
            return $response;
        }

        $this->headlessRequestId = $requestId;

        $allowTransition = $this->isTransitionRoute($route);
        $identity        = SessionHandler::resolveIdentity($request, $allowTransition);
        if ($identity instanceof WP_Error) return $identity;

        SessionHandler::prepareIdentity($identity);
        $this->initializingRequestId = $requestId;

        try {
            $guestToken = $identity['guest_token'];
            if ($identity['user_id'] !== null && $guestToken !== null) {
                $initialized = CartMerger::merge(
                    $guestToken,
                    fn(): true|WP_Error => $this->initializeCustomer($request)
                );
            } else {
                $initialized = $this->initializeCustomer($request);
            }

            if ($initialized instanceof WP_Error) return $initialized;

            $this->initializedRequestId = $requestId;
            return $response;
        } finally {
            $this->initializingRequestId = null;
        }
    }

    /** Surface the guest token only for successful headless Store API responses. */
    public function addCartTokenHeader(mixed $response, mixed $server, mixed $request): mixed
    {
        if (! $response instanceof WP_HTTP_Response) return $response;
        if (! $request instanceof WP_REST_Request) return $response;
        if (! $this->isHeadlessStoreRoute($request->get_route())) return $response;
        if ($response->get_status() >= 400) return $response;

        $session = WC()->session;
        if (! $session instanceof SessionHandler) return $response;

        $guestToken = $session->get_guest_token();
        if (SessionHandler::isValidGuestToken($guestToken) && $session->get_resolved_user_id() === null) {
            $response->header(SessionHandler::HEADER_GUEST_TOKEN, $guestToken);
        }

        return $response;
    }

    private function initializeCustomer(WP_REST_Request $request): true|WP_Error
    {
        if (! function_exists('wc_load_cart')) return true;

        // Capture proof before changing current_user from the Application
        // Password administrator to the resolved customer.
        $this->trustedAdminAuth = kizlo_is_application_password_authenticated()
            && current_user_can('manage_options');

        WC()->initialize_session();

        $session = WC()->session;
        if (! $session instanceof SessionHandler) {
            return new WP_Error(
                'kizlo_session_unavailable',
                'Headless session handler is not active for this request.',
                ['status' => 500]
            );
        }

        $targetUserId = $session->get_resolved_user_id() ?? 0;
        if (get_current_user_id() !== $targetUserId) {
            wp_set_current_user($targetUserId);
        }

        // wc_load_cart() registers a shutdown save against the customer object
        // it creates. Remove an earlier object so that save belongs to the
        // resolved customer, never the Application Password administrator.
        // @phpstan-ignore instanceof.alwaysTrue
        if (WC()->customer instanceof \WC_Customer && WC()->customer->get_id() !== $targetUserId) {
            remove_action('shutdown', [WC()->customer, 'save'], 10);
            // @phpstan-ignore assign.propertyType
            WC()->customer = null;
        }

        wc_load_cart();
        $this->applyGeoDefaults($request);

        return true;
    }

    private function applyGeoDefaults(WP_REST_Request $request): void
    {
        $session = WC()->session;
        if (! $session instanceof SessionHandler) return;
        if ($session->get('kizlo_geo_applied')) return;

        $customer = WC()->customer;
        // @phpstan-ignore instanceof.alwaysTrue
        if (! $customer instanceof \WC_Customer) return;

        if ($this->customerHasRealAddress($customer)) {
            $session->set('kizlo_geo_applied', true);
            return;
        }

        $country = strtoupper(trim((string) $request->get_header(SessionHandler::HEADER_GEO_COUNTRY)));
        if (! preg_match('/^[A-Z]{2}$/', $country)) return;

        $state    = strtoupper(trim((string) $request->get_header(SessionHandler::HEADER_GEO_STATE)));
        $postcode = trim((string) $request->get_header(SessionHandler::HEADER_GEO_POSTCODE));
        $city     = trim((string) $request->get_header(SessionHandler::HEADER_GEO_CITY));

        $customer->set_billing_country($country);
        $customer->set_shipping_country($country);
        if ($state !== '') {
            $customer->set_billing_state($state);
            $customer->set_shipping_state($state);
        }
        if ($postcode !== '') {
            $customer->set_billing_postcode($postcode);
            $customer->set_shipping_postcode($postcode);
        }
        if ($city !== '') {
            $customer->set_billing_city($city);
            $customer->set_shipping_city($city);
        }

        $customer->save();
        $session->set('kizlo_geo_applied', true);
    }

    private function customerHasRealAddress(\WC_Customer $customer): bool
    {
        return (string) $customer->get_billing_postcode() !== ''
            || (string) $customer->get_billing_address_1() !== ''
            || (string) $customer->get_billing_first_name() !== '';
    }

    private function isWooCommerceRoute(string $route): bool
    {
        return preg_match('#^/wc[-/]#', $route) === 1;
    }

    private function isHeadlessStoreRoute(string $route): bool
    {
        return preg_match('#^/wc/store/v1/(?:cart|checkout|order)(?:/|$)#', $route) === 1;
    }

    private function isTransitionRoute(string $route): bool
    {
        return preg_match('#^/wc/store/v1/(?:cart|checkout)(?:/|$)#', $route) === 1;
    }
}
