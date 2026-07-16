<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

use WC_Session_Handler;

/**
 * Headless WC session handler.
 *
 * Resolves the cart owner from request headers instead of cookies. Identity
 * headers are checked in priority order so the SDK can forward whatever its
 * auth adapter happens to return:
 *
 *   - X-Kizlo-User-Id        → numeric WP user id (fast path, no lookup)
 *   - X-Kizlo-User-Email     → resolved via get_user_by('email')
 *   - X-Kizlo-User-Username  → resolved via get_user_by('login')
 *   - X-Kizlo-Guest-Token    → session_key as-is, must start "t_" (returning guest)
 *   - none of the above      → new "t_{random}" token, exposed via response header
 *
 * All three user-identity headers resolve to the same numeric WP user id, so a
 * given user lands on the same wp_woocommerce_sessions row regardless of which
 * header was used — that's what makes carts sync across devices.
 *
 * Session keys must satisfy WC_Session_Handler::is_secure_customer_id() — that
 * method is hard-coded to accept only numeric IDs or "t_"-prefixed tokens, so
 * we use those shapes to stay compatible with WC's native save path.
 *
 * The trust boundary is the WordPress REST API authentication (Application Password)
 * applied by kizlo_register_route; this handler does not perform any auth itself.
 */
class SessionHandler extends WC_Session_Handler
{
    public const HEADER_USER_ID       = 'X-Kizlo-User-Id';
    public const HEADER_USER_EMAIL    = 'X-Kizlo-User-Email';
    public const HEADER_USER_USERNAME = 'X-Kizlo-User-Username';
    public const HEADER_GUEST_TOKEN   = 'X-Kizlo-Guest-Token';

    public const HEADER_GEO_COUNTRY  = 'X-Kizlo-Geo-Country';
    public const HEADER_GEO_STATE    = 'X-Kizlo-Geo-State';
    public const HEADER_GEO_POSTCODE = 'X-Kizlo-Geo-Postcode';
    public const HEADER_GEO_CITY     = 'X-Kizlo-Geo-City';

    public const PREFIX_GUEST = 't_';

    private ?int $resolved_user_id = null;

    public function init()
    {
        $this->_customer_id = $this->resolve_customer_id();
        $this->_data        = $this->get_session_data();

        add_action('shutdown', [$this, 'save_data'], 20);
    }

    public function get_resolved_user_id(): ?int
    {
        return $this->resolved_user_id;
    }

    public function get_guest_token(): string
    {
        return (string) $this->_customer_id;
    }

    /**
     * Cookies are disabled for this handler — every operation is no-op.
     */
    public function set_customer_session_cookie($set)
    {
        // no-op
    }

    public function maybe_set_customer_session_cookie()
    {
        // no-op
    }

    public function has_session()
    {
        return ! empty($this->_customer_id);
    }

    private function resolve_customer_id(): string
    {
        $headers = $this->read_request_headers();

        $user_id = $this->extract_user_id($headers);
        if ($user_id !== null) {
            $this->resolved_user_id = $user_id;
            return (string) $user_id;
        }

        $token = trim((string) ($headers[strtolower(self::HEADER_GUEST_TOKEN)] ?? ''));
        if ($token !== '' && $this->is_valid_guest_token($token)) {
            // Trust the token the SDK supplied — it crossed the App Password
            // boundary, which is the trust boundary the plugin enforces. If a
            // row exists under this key, WC loads it; if not, WC creates one
            // on first write. Either way the SDK gets back a cart keyed to
            // exactly the identity it supplied.
            //
            // Expired rows are purged here so a stale cart can't resurrect
            // before the WC cleanup cron runs (it's daily by default).
            $this->purge_if_expired($token);
            return $token;
        }

        // session_key column is VARCHAR(32); keep the prefix + hex within that.
        return self::PREFIX_GUEST . bin2hex(random_bytes(15));
    }

    /** Guest token shape: "t_" followed by exactly 30 hex chars. */
    private function is_valid_guest_token(string $token): bool
    {
        return strlen($token) === 32
            && str_starts_with($token, self::PREFIX_GUEST)
            && ctype_xdigit(substr($token, 2));
    }

    private function purge_if_expired(string $key): void
    {
        global $wpdb;
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$wpdb->prefix}woocommerce_sessions WHERE session_key = %s AND session_expiry <= %d",
                $key,
                time()
            )
        );
    }

    /**
     * Resolve the request's authenticated user id from any of the identity
     * headers. Priority order (id > email > username) means the SDK can send
     * the cheapest identifier it has — id needs no lookup, email/username
     * each cost one indexed query against the users table. Returns null if
     * no header is present or the lookup didn't match a WP user (treat as
     * guest then).
     */
    private function extract_user_id(array $headers): ?int
    {
        $raw_id = $this->header($headers, self::HEADER_USER_ID);
        if ($raw_id !== '' && preg_match('/^\d+$/', $raw_id)) {
            $user_id = (int) $raw_id;
            if ($user_id > 0 && get_userdata($user_id)) {
                return $user_id;
            }
            return null;
        }

        $email = $this->header($headers, self::HEADER_USER_EMAIL);
        if ($email !== '' && is_email($email)) {
            $user = get_user_by('email', $email);
            return $user ? (int) $user->ID : null;
        }

        $username = $this->header($headers, self::HEADER_USER_USERNAME);
        if ($username !== '') {
            $user = get_user_by('login', $username);
            return $user ? (int) $user->ID : null;
        }

        return null;
    }

    private function header(array $headers, string $name): string
    {
        return trim((string) ($headers[strtolower($name)] ?? ''));
    }

    /**
     * Returns request headers with lowercase keys. Falls back when getallheaders()
     * is unavailable (e.g. PHP-FPM without the Apache helper).
     */
    private function read_request_headers(): array
    {
        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            // getallheaders() can return false; WP stubs type it as array, so
            // PHPStan wrongly reads this guard as redundant.
            // @phpstan-ignore function.alreadyNarrowedType
            if (is_array($headers)) {
                return array_change_key_case($headers, CASE_LOWER);
            }
        }

        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (strncmp($name, 'HTTP_', 5) !== 0) continue;
            $key = strtolower(str_replace('_', '-', substr($name, 5)));
            $headers[$key] = $value;
        }
        return $headers;
    }
}
