<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

/**
 * Bootstraps the headless WooCommerce adapter.
 *
 * The plugin's contract with WC is intentionally minimal: swap the session
 * handler so the cart owner is resolved from request headers (rather than
 * cookies or Store API's Cart-Token JWT), and disable the admin's persistent
 * cart leaking into every session. Everything else — cart math, endpoints,
 * response shape, checkout — is left to WooCommerce. Clients talk to
 * /wc/store/v1/* directly and get the standard Store API behavior, just keyed
 * to the user/guest we resolved from their headers.
 */
class WooCommerceModule
{
    /**
     * Whether the request was authenticated via HTTP Basic by an admin BEFORE
     * we switched the current user to the cart owner. The nonce-bypass filter
     * fires after the switch, so it can't check admin caps directly — it reads
     * this flag instead.
     */
    private bool $trustedAdminAuth = false;

    public function register(): void
    {
        WooCommerceSchemas::register();

        add_filter('woocommerce_session_handler', [$this, 'maybeUseHeadlessSession']);
        add_filter('woocommerce_persistent_cart_enabled', [$this, 'maybeDisablePersistentCart']);
        add_filter('woocommerce_store_api_disable_nonce_check', [$this, 'maybeDisableNonceCheck']);
        add_filter('rest_post_dispatch', [$this, 'addCartTokenHeader'], 10, 3);
        add_filter('rest_request_before_callbacks', [$this, 'maybeSwitchStoreApiUser'], 10, 3);
        add_filter('rest_dispatch_request', [$this, 'maybeSwitchKizloCartUser'], 10, 4);
    }

    public function maybeUseHeadlessSession(string $default): string
    {
        return $this->isHeadlessRequest() ? SessionHandler::class : $default;
    }

    /**
     * WC merges the currently-authenticated user's saved persistent cart into
     * the session cart on every fresh load. Because our requests authenticate as
     * an administrator (App Password), that would leak the admin's saved cart
     * into every guest/user cart we operate on. Our session row is the source
     * of truth for headless flows, so disable the merge here.
     */
    public function maybeDisablePersistentCart(bool $enabled): bool
    {
        return $this->isHeadlessRequest() ? false : $enabled;
    }

    /**
     * Bypass Store API's nonce check for our trusted server-to-server requests.
     *
     * Reads the cached $trustedAdminAuth flag captured by the route-family
     * switch, before it swapped current_user — by the time this
     * filter actually runs (inside the route callback), current_user is the
     * cart owner, not the admin, so we can't recheck caps here.
     */
    public function maybeDisableNonceCheck(bool $disabled): bool
    {
        if ($disabled) return true;
        if (! $this->isHeadlessRequest()) return false;
        return $this->trustedAdminAuth;
    }

    private function isBasicAuthenticated(): bool
    {
        if (! empty($_SERVER['PHP_AUTH_USER'])) return true;
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        return is_string($auth) && stripos($auth, 'Basic ') === 0;
    }

    /**
     * Switch Store API requests before WooCommerce checks route permissions.
     *
     * WordPress has already run rest_authentication_errors at this point, so
     * Kizlo's global guard has verified the App Password administrator. Store
     * API permission callbacks now see the resolved customer and can authorize
     * registered orders against the identity in X-Kizlo-User-Email.
     */
    public function maybeSwitchStoreApiUser(mixed $response, mixed $handler, mixed $request): mixed
    {
        if (! $this->isStoreApiRequest()) return $response;

        return $this->switchToHeadlessUser($response, $request);
    }

    /**
     * Switch Kizlo's cart request after its route permission callback.
     *
     * Kizlo-owned routes attach their own manage_options callback. Keeping this
     * family on rest_dispatch_request lets that callback see the administrator,
     * while the route handler still runs as the resolved customer.
     */
    public function maybeSwitchKizloCartUser(mixed $dispatch_result, mixed $request, mixed $route, mixed $handler): mixed
    {
        if (! $this->isKizloCartRequest()) return $dispatch_result;

        return $this->switchToHeadlessUser($dispatch_result, $request);
    }

    /**
     * Initialize the headless session, then bind WooCommerce to its owner.
     *
     * Cart/session initialisation is also deferred to this point: doing it
     * earlier (e.g. on wp_loaded) would mint guest tokens and run DB lookups
     * for unauthenticated drive-by requests that RestGuard later rejects with
     * 401. By waiting until after authentication and permission checks have
     * passed, WC only touches the database for requests it would honour.
     *
     * Must return the original $dispatch_result (null) — anything else would
     * halt dispatch and skip the route callback.
     *
     * Order matters here. WC's `initialize_cart()` does two things together:
     *   1. constructs `WC()->customer` from the *current* user id
     *   2. registers a `shutdown` hook that calls save() on that exact
     *      customer object (it holds a hard reference)
     * If we let wc_load_cart() run while current_user is still the App
     * Password admin, the admin's customer gets hooked and on shutdown WC
     * persists `{id: 1, country: <admin-country>}` to the session —
     * overwriting whatever cart/address state we set during the request.
     *
     * So we initialise just the session first, switch current_user to the
     * cart owner (admin→0 for guests, admin→user_id for users), then call
     * wc_load_cart() so the customer (and its shutdown hook) are bound to
     * the right identity from the start.
     */
    private function switchToHeadlessUser(mixed $result, mixed $request): mixed
    {
        if (! function_exists('wc_load_cart')) return $result;

        // Capture admin-auth state BEFORE switching — see $trustedAdminAuth.
        $this->trustedAdminAuth = $this->isBasicAuthenticated() && current_user_can('manage_options');

        // Bring up session only — needed to read identity headers via SessionHandler.
        WC()->initialize_session();

        $session = WC()->session;
        if (! $session instanceof SessionHandler) return $result;

        $target_user_id = $session->get_resolved_user_id() ?? 0;
        if (get_current_user_id() !== $target_user_id) {
            wp_set_current_user($target_user_id);
        }

        // Defensive: if anything earlier already constructed a customer with
        // the wrong id, drop its shutdown-save hook (which still references
        // that wrong object) and clear the slot so wc_load_cart rebuilds.
        // WC()->customer is nullable at runtime (we null it just below); WC
        // stubs type it as non-null WC_Customer.
        // @phpstan-ignore instanceof.alwaysTrue
        if (WC()->customer instanceof \WC_Customer && WC()->customer->get_id() !== $target_user_id) {
            remove_action('shutdown', array(WC()->customer, 'save'), 10);
            // @phpstan-ignore assign.propertyType
            WC()->customer = null;
        }

        // Now construct cart + customer with the right user, and re-hook
        // shutdown save against the correct customer object.
        wc_load_cart();

        if ($request instanceof \WP_REST_Request) {
            $this->applyGeoDefaults($request);
        }

        return $result;
    }

    /**
     * Bootstrap the customer's billing/shipping address from SDK-supplied
     * geo headers so tax calculation works as soon as items are added.
     *
     * Only fires once per session (tracked via the `kizlo_geo_applied` session
     * flag). Country is the gate on the header side: WC's tax engine is keyed
     * on country and won't do anything useful without it, so other geo fields
     * are ignored if the country is missing or malformed.
     *
     * We don't gate on `get_billing_country()` because WC's data store auto-
     * fills it from `wc_get_customer_default_location()` during read — that'd
     * make the gate fail even on a brand-new guest. The session flag is a
     * reliable "we've already done this once" marker that survives across
     * requests and isn't accidentally set by WC defaults.
     *
     * Mirrors to both billing and shipping so tax works regardless of which
     * the store is configured to base on (`woocommerce_tax_based_on`).
     */
    private function applyGeoDefaults(\WP_REST_Request $request): void
    {
        $session = WC()->session;
        if (! $session instanceof SessionHandler) return;
        if ($session->get('kizlo_geo_applied')) return;

        $customer = WC()->customer;
        // WC()->customer is nullable at runtime; WC stubs type it non-null.
        // @phpstan-ignore instanceof.alwaysTrue
        if (! $customer instanceof \WC_Customer) return;

        // If the customer already has a real user-entered address (anything
        // set_defaults can't have produced — postcode, address_1, first_name),
        // they've moved past the geo-bootstrap stage. Mark applied and bail.
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

    /**
     * True when the customer has any address field WC's set_defaults can't
     * have produced. We check postcode/address_1/first_name because
     * set_defaults only touches country/state/email.
     */
    private function customerHasRealAddress(\WC_Customer $customer): bool
    {
        return (string) $customer->get_billing_postcode() !== ''
            || (string) $customer->get_billing_address_1() !== ''
            || (string) $customer->get_billing_first_name() !== '';
    }

    /**
     * Surface the guest cart token on every headless response so the client
     * always has the latest value to send back on subsequent requests. Only
     * emitted for guest sessions — user sessions are identified by user_id,
     * which the client already knows.
     */
    public function addCartTokenHeader(mixed $response, mixed $server, mixed $request): mixed
    {
        if (! $response instanceof \WP_HTTP_Response) return $response;
        if (! $this->isHeadlessRequest()) return $response;

        // Never echo a cart token on error responses. Combined with deferring
        // session init to the route-family switches guarantees unauthenticated
        // callers neither see nor cause a token to be minted.
        if ($response->get_status() >= 400) return $response;

        $session = WC()->session;
        if (! $session instanceof SessionHandler) return $response;

        $customer_id = (string) $session->get_guest_token();
        if (str_starts_with($customer_id, SessionHandler::PREFIX_GUEST)) {
            $response->header(SessionHandler::HEADER_GUEST_TOKEN, $customer_id);
        }

        return $response;
    }

    /**
     * True for both Store API requests (which clients hit directly) and our own
     * merge endpoint under /kizlo/v1/cart.
     */
    private function isHeadlessRequest(): bool
    {
        return $this->isStoreApiRequest() || $this->isKizloCartRequest();
    }

    private function isStoreApiRequest(): bool
    {
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        if ($uri === '') return false;

        $needles = [
            '/wp-json/wc/store/',
            'rest_route=/wc/store/',
        ];

        foreach ($needles as $needle) {
            if (strpos($uri, $needle) !== false) return true;
        }
        return false;
    }

    private function isKizloCartRequest(): bool
    {
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        if ($uri === '') return false;

        $needles = [
            '/wp-json/' . KIZLO_API_NAMESPACE . '/cart',
            'rest_route=/' . KIZLO_API_NAMESPACE . '/cart',
        ];

        foreach ($needles as $needle) {
            if (strpos($uri, $needle) !== false) return true;
        }
        return false;
    }
}
