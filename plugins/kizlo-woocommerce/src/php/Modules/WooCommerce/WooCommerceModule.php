<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

use Kizlo\WooCommerce\Modules\Cart\CartMerger;
use WP_Error;
use WP_HTTP_Response;
use WP_REST_Request;
use WeakMap;

/** Bootstraps the request-scoped headless WooCommerce session adapter. */
class WooCommerceModule
{
    private ?WP_REST_Request $headlessRequest = null;
    private ?WP_REST_Request $initializingRequest = null;
    private ?WP_REST_Request $initializedRequest = null;
    /** @var WeakMap<WP_REST_Request, int> */
    private WeakMap $nativeUsers;

    public function __construct()
    {
        $this->nativeUsers = new WeakMap();
    }

    public function register(): void
    {
        WooCommerceSchemas::register();
        add_action('rest_api_init', static function (): void {
            // Store API's CORS callback can exit on preflight before our exact-origin policy runs.
            global $wp_filter;
            foreach ($wp_filter['rest_pre_serve_request']->callbacks ?? [] as $priority => $callbacks) {
                foreach ($callbacks as $callback) {
                    $function = $callback['function'];
                    if (is_array($function) && is_object($function[0])
                        && get_class($function[0]) === 'Automattic\\WooCommerce\\StoreApi\\Authentication'
                        && $function[1] === 'send_cors_headers') {
                        remove_filter('rest_pre_serve_request', $function, $priority);
                    }
                }
            }
        }, PHP_INT_MAX);


        add_filter('kizlo_rest_route_requires_admin', [$this, 'requiresKizloAdmin'], 10, 2);
        add_filter('woocommerce_session_handler', [$this, 'maybeUseHeadlessSession'], PHP_INT_MAX);
        add_filter('woocommerce_persistent_cart_enabled', [$this, 'maybeDisablePersistentCart']);
        add_filter('rest_request_before_callbacks', [$this, 'maybeSwitchStoreApiUser'], 10, 3);
        add_filter('rest_request_before_callbacks', [$this, 'maybeApplyGeoDefaults'], 30, 3);
        add_filter('rest_request_after_callbacks', [$this, 'restoreNativeUser'], PHP_INT_MAX, 3);

        // Global (not headless-request-scoped) so an off-session gateway
        // webhook/IPN that completes payment can still reach the owning cart.
        add_action('woocommerce_store_api_checkout_order_processed', [$this, 'captureOrderSessionKey']);
        add_action('woocommerce_order_status_changed', [$this, 'clearCartForPaidOrder'], 10, 4);
    }

    /** Store API and WooCommerce administration retain their own route permissions. */
    public function requiresKizloAdmin(bool $required, WP_REST_Request $request): bool
    {
        $route = $request->get_route();
        if (str_starts_with($route, '/wc/store/')) return false;
        if ($this->isWooCommerceRoute($route)) return false;

        return $required;
    }

    public function maybeUseHeadlessSession(string $default): string
    {
        return $this->headlessRequest !== null ? SessionHandler::class : $default;
    }

    public function maybeDisablePersistentCart(bool $enabled): bool
    {
        return $this->headlessRequest !== null ? false : $enabled;
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

    /** Resolve identity and cart proof before native Store API permissions run. */
    public function maybeSwitchStoreApiUser(mixed $response, mixed $handler, mixed $request): mixed
    {
        if (is_wp_error($response)) return $response;
        if (! $request instanceof WP_REST_Request) return $response;

        $route = $request->get_route();
        if (! $this->isHeadlessStoreRoute($route)) return $response;

        if (!in_array($request->get_method(), ['GET', 'HEAD', 'OPTIONS'], true)
            && !$request->get_header('Cart-Token') && !$request->get_header('Nonce')) {
            return new WP_Error('woocommerce_rest_missing_nonce', 'A Cart-Token or Store API nonce is required.', ['status' => 401]);
        }

        $currentRequest = $request;
        if ($this->initializedRequest === $currentRequest || $this->initializingRequest === $currentRequest) {
            return $response;
        }

        $this->headlessRequest = $currentRequest;

        $allowTransition = $this->isTransitionRoute($route);
        $identity        = SessionHandler::resolveIdentity($request, $allowTransition);
        if ($identity instanceof WP_Error) return $identity;
        $activeSession = WC()->session;
        if ($this->initializedRequest !== null && $activeSession instanceof SessionHandler) {
            $owner = $identity['user_id'] === null ? $identity['guest_token'] : (string) $identity['user_id'];
            if ($owner !== null && $owner !== $activeSession->get_customer_id()) {
                return new WP_Error('kizlo_conflicting_identity', 'A REST batch cannot switch cart owners.', ['status' => 401]);
            }
            if ($identity['user_id'] === null && $activeSession->get_resolved_user_id() !== null) {
                return new WP_Error('kizlo_conflicting_identity', 'A customer session requires its verified identity.', ['status' => 401]);
            }
        }
        if (str_starts_with($route, '/wc/store/v1/checkout') && $request->get_method() === 'POST') {
            if ($request->get_param('create_account')) {
                return new WP_Error('kizlo_verified_account_required', 'Create and verify your account with the configured identity provider.', ['status' => 403]);
            }
            if ($identity['user_id'] === null && WC()->checkout()->is_registration_required()) {
                return new WP_Error('kizlo_verified_account_required', 'A verified customer account is required for checkout.', ['status' => 403]);
            }
        }


        $this->nativeUsers[$request] = get_current_user_id();
        SessionHandler::prepareIdentity($identity);
        $this->initializingRequest = $currentRequest;

        try {
            $guestToken = $identity['guest_token'];
            if ($identity['user_id'] !== null && $guestToken !== null) {
                $initialized = CartMerger::merge(
                    $guestToken,
                    $identity['user_id'],
                    fn(): true|WP_Error => $this->initializeCustomer($request)
                );
            } else {
                $initialized = $this->initializeCustomer($request);
            }

            if ($initialized instanceof WP_Error) return $initialized;

            $this->initializedRequest = $currentRequest;
            return $response;
        } finally {
            $this->initializingRequest = null;
        }
    }

    public function restoreNativeUser(mixed $response, mixed $handler, WP_REST_Request $request): mixed
    {
        if (isset($this->nativeUsers[$request])) wp_set_current_user($this->nativeUsers[$request]);
        return $response;
    }

    /** Apply customer geo defaults only after other pre-callback validation succeeds. */
    public function maybeApplyGeoDefaults(mixed $response, mixed $handler, mixed $request): mixed
    {
        if (is_wp_error($response)) return $response;
        if (! $request instanceof WP_REST_Request) return $response;
        if ($this->initializedRequest !== $request) return $response;

        $this->applyGeoDefaults($request);

        return $response;
    }

    private function initializeCustomer(WP_REST_Request $request): true|WP_Error
    {
        if (! function_exists('wc_load_cart')) return true;

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
        SessionHandler::setCurrentUser($targetUserId);

        wc_load_cart();

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

        $ip = \Kizlo\Modules\Auth\RequestMetadata::ip();
        if ($ip === '') return;
        $location = \WC_Geolocation::geolocate_ip($ip);
        $country = strtoupper((string) ($location['country'] ?? ''));
        if (! preg_match('/^[A-Z]{2}$/', $country)) return;

        $state = strtoupper((string) ($location['state'] ?? ''));

        $customer->set_billing_country($country);
        $customer->set_shipping_country($country);
        if ($state !== '') {
            $customer->set_billing_state($state);
            $customer->set_shipping_state($state);
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
