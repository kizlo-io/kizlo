<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

use WC_Session_Handler;
use WP_Error;
use WP_REST_Request;
use WP_User;

/**
 * WooCommerce session handler for Kizlo's server-to-server Store API calls.
 *
 * Identity is resolved and validated from the matched REST request before
 * WooCommerce initializes, then consumed here, so an invalid or conflicting
 * header can never silently fall back to a new guest cart:
 *
 *   - X-Kizlo-User-Email  → the signed-in user's email (sole identity)
 *   - X-Kizlo-Guest-Token → an existing "t_" guest session (returning guest)
 *   - neither             → a new "t_{random}" token, exposed via response header
 *
 * Email is the sole identity: the SDK's auth adapter is email-keyed and a
 * logged-in email may not yet have a WordPress account (e.g. the Clerk driver),
 * so a matching account is created on demand and the same email always lands on
 * the same wp_woocommerce_sessions row, which is what makes carts sync across
 * devices.
 *
 * Session keys must satisfy WC_Session_Handler::is_secure_customer_id() — that
 * method is hard-coded to accept only numeric IDs or "t_"-prefixed tokens, so
 * those are the shapes used to stay compatible with WC's native save path.
 *
 * The trust boundary is the WordPress REST API authentication (Application
 * Password) enforced by Kizlo's guard; this handler performs no auth itself.
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

    /** The signed token, cookie and database row all live for 48 hours. */
    public const SESSION_LIFETIME = 48 * HOUR_IN_SECONDS;

    /** @var array{user_id: ?int, guest_token: ?string}|null */
    private static ?array $preparedIdentity = null;

    private ?int $resolved_user_id = null;
    private string $guest_token = '';

    public function init()
    {
        $identity               = self::$preparedIdentity ?? ['user_id' => null, 'guest_token' => null];
        $this->resolved_user_id = $identity['user_id'];
        $this->guest_token      = (string) ($identity['guest_token'] ?? '');

        if ($this->resolved_user_id !== null) {
            $this->_customer_id = (string) $this->resolved_user_id;
        } elseif ($this->guest_token !== '') {
            $this->purge_if_expired($this->guest_token);
            $this->_customer_id = $this->guest_token;
        } else {
            // session_key is VARCHAR(32); keep the prefix + hex within it.
            $this->_customer_id = self::PREFIX_GUEST . bin2hex(random_bytes(15));
            $this->guest_token  = $this->_customer_id;
        }

        $this->_data = $this->get_session_data();

        add_action('shutdown', [$this, 'save_data'], 20);
    }

    /**
     * Resolve and validate the request identity before WooCommerce initializes.
     * A valid email resolves to its account or creates a customer on demand; an
     * unresolvable email, a malformed guest token, or a user-plus-guest pairing
     * outside a transition is rejected rather than downgraded to a guest.
     *
     * @return array{user_id: ?int, guest_token: ?string}|WP_Error
     */
    public static function resolveIdentity(WP_REST_Request $request, bool $allowTransition): array|WP_Error
    {
        $userId = null;

        $email = trim((string) $request->get_header(self::HEADER_USER_EMAIL));
        if ($email !== '') {
            if (! is_email($email)) return self::invalidIdentity(self::HEADER_USER_EMAIL);

            $resolved = self::resolveOrCreateUser($email);
            if ($resolved instanceof WP_Error) return $resolved;
            $userId = $resolved;
        }

        $guestToken = trim((string) $request->get_header(self::HEADER_GUEST_TOKEN));
        if ($guestToken !== '' && ! self::isValidGuestToken($guestToken)) {
            return self::invalidIdentity(self::HEADER_GUEST_TOKEN);
        }

        if ($userId !== null && $guestToken !== '' && ! $allowTransition) {
            return new WP_Error(
                'kizlo_conflicting_identity',
                'User and guest identities may only be combined for cart or checkout transitions.',
                ['status' => 401]
            );
        }

        return [
            'user_id'     => $userId,
            'guest_token' => $guestToken !== '' ? $guestToken : null,
        ];
    }

    /** @param array{user_id: ?int, guest_token: ?string} $identity */
    public static function prepareIdentity(array $identity): void
    {
        self::$preparedIdentity = $identity;
    }

    public static function clearPreparedIdentity(): void
    {
        self::$preparedIdentity = null;
    }

    public static function isValidGuestToken(string $token): bool
    {
        return preg_match('/^t_[a-f0-9]{30}$/', $token) === 1;
    }

    public function get_resolved_user_id(): ?int
    {
        return $this->resolved_user_id;
    }

    public function get_guest_token(): string
    {
        return $this->guest_token;
    }

    /** Cookies are disabled for this handler; Kizlo owns the signed cookie. */
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

    public function set_session_expiration()
    {
        $this->_session_expiring   = time() + self::SESSION_LIFETIME - HOUR_IN_SECONDS;
        $this->_session_expiration = time() + self::SESSION_LIFETIME;
    }

    /** Persist now and verify the customer row reached MySQL. */
    public function persist(): bool
    {
        global $wpdb;

        $this->save_data();

        $row = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT session_value, session_expiry FROM %i WHERE session_key = %s',
                $wpdb->prefix . 'woocommerce_sessions',
                $this->get_customer_id()
            ),
            ARRAY_A
        );

        return is_array($row)
            && (string) ($row['session_value'] ?? '') === maybe_serialize($this->_data)
            && (int) ($row['session_expiry'] ?? 0) > time();
    }

    private static function invalidIdentity(string $header): WP_Error
    {
        return new WP_Error(
            'kizlo_invalid_identity',
            sprintf('%s does not identify a valid headless customer.', $header),
            ['status' => 401]
        );
    }

    private function purge_if_expired(string $key): void
    {
        global $wpdb;
        $wpdb->query(
            $wpdb->prepare(
                'DELETE FROM %i WHERE session_key = %s AND session_expiry <= %d',
                $wpdb->prefix . 'woocommerce_sessions',
                $key,
                time()
            )
        );
    }

    /**
     * Resolve an email to a WordPress user id, creating a customer account when
     * none exists. The resolve-or-create runs under a per-email lock so
     * concurrent requests for a new email converge on a single account rather
     * than racing to insert duplicates.
     */
    private static function resolveOrCreateUser(string $email): int|WP_Error
    {
        $existing = get_user_by('email', $email);
        if ($existing instanceof WP_User) {
            return self::resolvableUserId($existing);
        }

        $lock = 'kizlo_wc_user_lock_' . md5($email);
        if (! self::acquireLock($lock)) {
            // Another request holds the lock and is mid-create; wait for the
            // row it is inserting instead of creating a competing account.
            $waited = self::waitForUser($email);
            return $waited instanceof WP_User ? self::resolvableUserId($waited) : self::customerUnavailable();
        }

        try {
            // Re-check inside the lock: the row may have appeared between the
            // first lookup and acquiring the lock.
            $existing = get_user_by('email', $email);
            if ($existing instanceof WP_User) {
                return self::resolvableUserId($existing);
            }

            return self::createCustomer($email);
        } finally {
            self::releaseLock($lock);
        }
    }

    private static function createCustomer(string $email): int|WP_Error
    {
        $user_id = wp_insert_user([
            'user_login' => self::uniqueLogin($email),
            'user_email' => $email,
            'user_pass'  => wp_generate_password(24, true, true),
            'role'       => 'customer',
        ]);

        if (is_wp_error($user_id)) {
            // Lost a create race (duplicate email) or another failure — fall
            // back to whatever account now exists for this email.
            $existing = get_user_by('email', $email);
            return $existing instanceof WP_User ? self::resolvableUserId($existing) : self::customerUnavailable();
        }

        return (int) $user_id;
    }

    /** Derive a unique, WP-valid login from the email. */
    private static function uniqueLogin(string $email): string
    {
        $base = sanitize_user($email, true);
        if ($base === '') {
            $base = 'kizlo_user';
        }

        $login  = $base;
        $suffix = 2;
        while (username_exists($login)) {
            $login = $base . '_' . $suffix;
            $suffix++;
        }

        return $login;
    }

    /**
     * The id of an account allowed to own a headless cart. Privileged
     * (edit_posts) accounts are refused by default so a forwarded email can
     * never take over an editor's or admin's session; the filter lets a site
     * adjust the rule.
     */
    private static function resolvableUserId(WP_User $user): int|WP_Error
    {
        $resolvable = (bool) apply_filters(
            'kizlo_woocommerce_resolvable_cart_user',
            ! user_can($user, 'edit_posts'),
            $user
        );

        if (! $resolvable) {
            return new WP_Error(
                'kizlo_forbidden_identity',
                'This email cannot own a headless cart.',
                ['status' => 403]
            );
        }

        return (int) $user->ID;
    }

    private static function customerUnavailable(): WP_Error
    {
        return new WP_Error(
            'kizlo_customer_unavailable',
            'The headless customer account could not be resolved. Retry the request.',
            ['status' => 503]
        );
    }

    /**
     * Poll briefly for the account the lock holder is creating so a losing
     * request converges on it instead of failing.
     */
    private static function waitForUser(string $email): ?WP_User
    {
        for ($i = 0; $i < 50; $i++) {
            usleep(100_000); // 100ms, up to ~5s total
            $existing = get_user_by('email', $email);
            if ($existing instanceof WP_User) return $existing;
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
    private static function acquireLock(string $key): bool
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

    private static function releaseLock(string $key): void
    {
        if (wp_using_ext_object_cache()) {
            wp_cache_delete($key, 'kizlo');
            return;
        }
        delete_transient($key);
    }
}
