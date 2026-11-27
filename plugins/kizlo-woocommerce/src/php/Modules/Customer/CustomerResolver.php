<?php

namespace Kizlo\WooCommerce\Modules\Customer;

use WP_Error;
use WP_User;
use WP_REST_Request;
use Kizlo\Modules\Auth\AuthModule;
use Kizlo\Modules\Auth\Identity;

final class CustomerResolver
{
    /** An unverified external account can shop as a guest, never as an email-linked customer. */
    public static function forRequest(WP_REST_Request $request): int|WP_Error|null
    {
        $identity = AuthModule::identity($request);
        if ($identity instanceof WP_Error) return $identity;
        if ($identity instanceof Identity) {
            if (!$identity->emailVerified || $identity->email === null) return null;
            return self::resolve($identity->email);
        }

        // Service credentials authorize administration; they do not select a customer's cart.
        if (kizlo_is_application_password_authenticated()) return null;
        $user = wp_get_current_user();
        return $user->exists() ? self::resolvableUserId($user) : null;
    }

    /**
     * Resolve an email to a WordPress user id, creating a customer account when
     * none exists. The resolve-or-create runs under a per-email lock so
     * concurrent requests for a new email converge on a single account rather
     * than racing to insert duplicates.
     */
    public static function resolve(string $email): int|WP_Error
    {
        $email = trim($email);
        if (! is_email($email)) {
            return new WP_Error('kizlo_invalid_identity', 'A verified customer email is required.', ['status' => 401]);
        }

        $existing = get_user_by('email', $email);
        if ($existing instanceof WP_User) {
            return self::resolvableUserId($existing);
        }

        global $wpdb;
        $lock = 'kizlo_customer_' . substr(hash('sha256', $wpdb->users . ':' . strtolower($email)), 0, 48);
        $acquired = $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, %d)', $lock, 5));
        if ((string) $acquired !== '1') return self::customerUnavailable();

        try {
            // Re-check inside the lock: the row may have appeared between the
            // first lookup and acquiring the lock.
            $existing = get_user_by('email', $email);
            if ($existing instanceof WP_User) {
                return self::resolvableUserId($existing);
            }

            return self::createCustomer($email);
        } finally {
            $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock));
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
            ! user_can($user, 'edit_posts') && !user_can($user, 'manage_options') && !user_can($user, 'manage_woocommerce'),
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
}
