<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

use WC_Session_Handler;
use WP_User;

/**
 * Headless WC session handler.
 *
 * Resolves the cart owner from request headers instead of cookies:
 *
 *   - X-Kizlo-User-Email     → the signed-in user's email (sole identity)
 *   - X-Kizlo-Guest-Token    → session_key as-is, must start "t_" (returning guest)
 *   - none of the above      → new "t_{random}" token, exposed via response header
 *
 * Email is the sole identity: the SDK's auth adapter is email-keyed and a
 * logged-in email may not yet have a WordPress account (e.g. the Clerk driver),
 * so a matching account is created on demand and the same email always lands on
 * the same wp_woocommerce_sessions row — that's what makes carts sync across
 * devices.
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
    public const HEADER_USER_EMAIL  = 'X-Kizlo-User-Email';
    public const HEADER_GUEST_TOKEN = 'X-Kizlo-Guest-Token';

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
     * Resolve the request's user id from the sole identity header. A valid
     * email that matches an account resolves to it; an email with no account
     * creates a customer on demand (see {@see resolve_or_create_user}). Returns
     * null when no valid email header is present, so the caller treats the
     * request as a guest.
     */
    private function extract_user_id(array $headers): ?int
    {
        $email = $this->header($headers, self::HEADER_USER_EMAIL);
        if ($email === '' || ! is_email($email)) {
            return null;
        }

        return $this->resolve_or_create_user($email);
    }

    /**
     * Resolve an email to a WordPress user id, creating a customer account when
     * none exists. The resolve-or-create runs under a per-email lock so
     * concurrent requests for a new email converge on a single account rather
     * than racing to insert duplicates.
     */
    private function resolve_or_create_user(string $email): ?int
    {
        $existing = get_user_by('email', $email);
        if ($existing) {
            return $this->is_resolvable_user($existing) ? (int) $existing->ID : null;
        }

        $lock = 'kizlo_wc_user_lock_' . md5($email);
        if (! $this->acquire_lock($lock)) {
            // Another request holds the lock and is mid-create; wait for the
            // row it is inserting instead of creating a competing account.
            return $this->wait_for_user($email);
        }

        try {
            // Re-check inside the lock: the row may have appeared between the
            // first lookup and acquiring the lock.
            $existing = get_user_by('email', $email);
            if ($existing) {
                return $this->is_resolvable_user($existing) ? (int) $existing->ID : null;
            }

            return $this->create_customer($email);
        } finally {
            $this->release_lock($lock);
        }
    }

    private function create_customer(string $email): ?int
    {
        $user_id = wp_insert_user([
            'user_login' => $this->unique_login($email),
            'user_email' => $email,
            'user_pass'  => wp_generate_password(24, true, true),
            'role'       => 'customer',
        ]);

        if (is_wp_error($user_id)) {
            // Lost a create race (duplicate email) or another failure — fall
            // back to whatever account now exists for this email.
            $existing = get_user_by('email', $email);
            return $existing && $this->is_resolvable_user($existing) ? (int) $existing->ID : null;
        }

        return (int) $user_id;
    }

    /** Derive a unique, WP-valid login from the email. */
    private function unique_login(string $email): string
    {
        $base = sanitize_user($email, true);
        if ($base === '') {
            $base = 'kizlo_user';
        }

        $login = $base;
        $suffix = 2;
        while (username_exists($login)) {
            $login = $base . '_' . $suffix;
            $suffix++;
        }

        return $login;
    }

    /**
     * Whether an existing account may be resolved as a headless cart owner.
     * Privileged (edit_posts) accounts are refused by default so a forwarded
     * email can never take over an editor's or admin's session; the filter
     * lets a site adjust the rule.
     */
    private function is_resolvable_user(WP_User $user): bool
    {
        $resolvable = ! user_can($user, 'edit_posts');

        return (bool) apply_filters('kizlo_woocommerce_resolvable_cart_user', $resolvable, $user);
    }

    /**
     * Poll briefly for the account the lock holder is creating so a losing
     * request converges on it instead of falling through to guest.
     */
    private function wait_for_user(string $email): ?int
    {
        for ($i = 0; $i < 50; $i++) {
            usleep(100_000); // 100ms, up to ~5s total
            $existing = get_user_by('email', $email);
            if ($existing) {
                return $this->is_resolvable_user($existing) ? (int) $existing->ID : null;
            }
        }

        return null;
    }

    /**
     * Best-effort cross-request lock. Uses the persistent object cache's atomic
     * add when one is present, and falls back to a transient otherwise (the
     * default per-request cache can't coordinate across requests). The create
     * path re-checks and tolerates a lost race, so the lock only has to make
     * duplicate creation rare, not impossible.
     */
    private function acquire_lock(string $key): bool
    {
        if (wp_using_ext_object_cache()) {
            return wp_cache_add($key, 1, 'kizlo', 30);
        }

        if (get_transient($key) !== false) {
            return false;
        }
        set_transient($key, 1, 30);
        return true;
    }

    private function release_lock(string $key): void
    {
        if (wp_using_ext_object_cache()) {
            wp_cache_delete($key, 'kizlo');
            return;
        }
        delete_transient($key);
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
