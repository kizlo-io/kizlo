<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

use WC_Session_Handler;
use WP_Error;
use WP_REST_Request;
use WP_User;

/**
 * WooCommerce session handler for Kizlo's server-to-server Store API calls.
 *
 * Identity is validated from the matched REST request before WooCommerce is
 * initialized. The prepared identity is then consumed here so invalid or
 * conflicting headers can never silently fall back to a new guest cart.
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
     * Validate every supplied identity before WooCommerce initializes.
     *
     * @return array{user_id: ?int, guest_token: ?string}|WP_Error
     */
    public static function resolveIdentity(WP_REST_Request $request, bool $allowTransition): array|WP_Error
    {
        $userIds = [];

        $rawId = trim((string) $request->get_header(self::HEADER_USER_ID));
        if ($rawId !== '') {
            $user = ctype_digit($rawId) && (int) $rawId > 0 ? get_userdata((int) $rawId) : false;
            if (! $user instanceof WP_User) return self::invalidIdentity(self::HEADER_USER_ID);
            $userIds[] = (int) $user->ID;
        }

        $email = trim((string) $request->get_header(self::HEADER_USER_EMAIL));
        if ($email !== '') {
            $user = is_email($email) ? get_user_by('email', $email) : false;
            if (! $user instanceof WP_User) return self::invalidIdentity(self::HEADER_USER_EMAIL);
            $userIds[] = (int) $user->ID;
        }

        $username = trim((string) $request->get_header(self::HEADER_USER_USERNAME));
        if ($username !== '') {
            $user = get_user_by('login', $username);
            if (! $user instanceof WP_User) return self::invalidIdentity(self::HEADER_USER_USERNAME);
            $userIds[] = (int) $user->ID;
        }

        $userIds = array_values(array_unique($userIds));
        if (count($userIds) > 1) {
            return new WP_Error(
                'kizlo_conflicting_identity',
                'The supplied user identity headers resolve to different users.',
                ['status' => 401]
            );
        }

        $guestToken = trim((string) $request->get_header(self::HEADER_GUEST_TOKEN));
        if ($guestToken !== '' && ! self::isValidGuestToken($guestToken)) {
            return self::invalidIdentity(self::HEADER_GUEST_TOKEN);
        }

        $userId = $userIds[0] ?? null;
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
}
