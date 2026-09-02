<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

use Kizlo\WooCommerce\Modules\Cart\CartMerger;
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
        add_filter('rest_post_dispatch', [$this, 'addCartTokenHeader'], 10, 3);
        add_filter('rest_request_before_callbacks', [$this, 'maybeSwitchStoreApiUser'], 10, 3);
    }

    /** Keep only identity-sensitive WooCommerce routes behind Kizlo's guard. */
    public function requiresKizloAdmin(bool $required, WP_REST_Request $request): bool
    {
        $route = $request->get_route();
        if (! str_starts_with($route, '/wc/store/') && ! str_starts_with($route, '/wc/v3/')) {
            return $required;
        }

        return $this->isProtectedWooCommerceRoute($route);
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
     * Validate and initialize only cart, checkout and order Store API requests.
     * The object id makes repeated filter passes for one request harmless.
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

    private function isProtectedWooCommerceRoute(string $route): bool
    {
        return preg_match('#^/wc/store/v1/(?:cart|checkout|order)(?:/|$)#', $route) === 1
            || preg_match('#^/wc/v3/(?:customers|orders)(?:/|$)#', $route) === 1;
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
