<?php

namespace Kizlo\Pos\Modules\Checkout;

use Kizlo\Pos\Support\Lock;

final class Customer
{
    private static function phoneMatches(string $phone): array
    {
        if ($phone === '') return [];
        global $wpdb;
        // Existing WooCommerce phones can be locally formatted. Narrow candidates before country-aware normalization.
        $digits = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(meta_value,' ',''),'-',''),'(',''),')',''),'.',''),'+','')";
        $rows = $wpdb->get_results($wpdb->prepare("SELECT user_id,meta_value FROM {$wpdb->usermeta} WHERE meta_key='billing_phone' AND $digits LIKE %s LIMIT 101", '%' . substr($phone, -7)));
        if ($wpdb->last_error !== '' || count($rows) > 100) throw new CheckoutError('Phone lookup needs staff review in WooCommerce.', 409);
        $ids = [];
        foreach ($rows as $row) {
            $country = get_user_meta($row->user_id, 'billing_country', true) ?: wc_get_base_location()['country'];
            try { if (Input::phone($row->meta_value, $country) === $phone) $ids[] = (int) $row->user_id; }
            catch (CheckoutError $error) { continue; }
        }
        return array_values(array_unique($ids));
    }

    public static function resolve(array $contact): int
    {
        if ($contact['email'] === '' && $contact['phone'] === '') return 0;
        // Serialize the two-key lookup as well as creation; email/phone pairs can overlap across tills.
        return Lock::run('customers', static function () use ($contact): int {
            $email = $contact['email'] !== '' ? get_user_by('email', $contact['email']) : false;
            $phoneIds = self::phoneMatches($contact['phone']);
            if (count($phoneIds) > 1 || ($email && $phoneIds && $email->ID !== (int) $phoneIds[0])) throw new CheckoutError('Email and phone identify different customers. Resolve the customer in WooCommerce first.', 409);
            $id = $email ? $email->ID : (int) ($phoneIds[0] ?? 0);
            if ($id) {
                if (user_can($id, 'edit_posts') || user_can($id, 'manage_woocommerce')) throw new CheckoutError('A staff account cannot be the sale customer.', 409);
                $customer = new \WC_Customer($id);
                if ($contact['email'] !== '' && !$email && !get_user_meta($id, '_kizlo_pos_placeholder_email', true)) throw new CheckoutError('This phone belongs to a customer with another email. Resolve the customer first.', 409);
                if ($contact['phone'] !== '' && $customer->get_billing_phone() !== '' && !in_array($id, $phoneIds, true)) throw new CheckoutError('This email belongs to a customer with another phone. Resolve the customer first.', 409);
                // Profile changes require an explicit account edit; checkout attaches the order without overwriting them.
                return $id;
            }
            $placeholder = $contact['email'] === '';
            $address = $placeholder ? hash_hmac('sha256', $contact['phone'], wp_salt('auth')) . '@pos.invalid' : $contact['email'];
            $login = sanitize_user($placeholder ? ltrim($contact['phone'], '+') : $contact['email'], true);
            $login = substr($login, 0, 50);
            $base = $login;
            for ($suffix = 2; username_exists($login); $suffix++) $login = $base . '_' . $suffix;
            // The placeholder flag must exist before WooCommerce fires its new-customer notification.
            $id = wc_create_new_customer($address, $login, wp_generate_password(32, true, true), [
                'first_name' => $contact['first_name'], 'last_name' => $contact['last_name'],
                'meta_input' => ['billing_phone' => $contact['phone'], '_kizlo_pos_placeholder_email' => $placeholder ? 'yes' : ''],
            ]);
            if (is_wp_error($id)) throw new CheckoutError($id->get_error_message(), 409);
            return (int) $id;
        });
    }

    public static function register(): void
    {
        add_filter('pre_wp_mail', static function ($result, array $attributes) {
            $recipients = is_array($attributes['to']) ? $attributes['to'] : explode(',', (string) $attributes['to']);
            foreach ($recipients as $recipient) {
                if (preg_match('/(?:^|<)[^<>\s]+@pos\.invalid>?$/i', trim($recipient))) return false;
            }
            return $result;
        }, 10, 2);
    }
}
