<?php

namespace Kizlo\Pos\Modules\Checkout;

use Kizlo\Pos\Modules\Settings\Settings;
use libphonenumber\PhoneNumberUtil;
use libphonenumber\PhoneNumberFormat;

final class Input
{
    public const CONTACT = ['first_name', 'last_name', 'email', 'phone'];
    public const ADDRESS = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country'];

    public static function keys(array $value, array $allowed): void
    {
        if (array_diff(array_keys($value), $allowed)) throw new CheckoutError('Unsupported checkout field.');
    }

    public static function text(mixed $value, int $limit = 200): string
    {
        if (!is_string($value) || strlen($value) > $limit) throw new CheckoutError('A checkout field is invalid or too long.');
        return sanitize_text_field($value);
    }

    public static function uuid(mixed $value): string
    {
        if (!is_string($value) || !wp_is_uuid($value, 4)) throw new CheckoutError('A valid sale/request identifier is required.');
        return strtolower($value);
    }

    public static function storeAddress(): array
    {
        $base = wc_get_base_location();
        return ['country' => $base['country'], 'state' => $base['state'],
            'address_1' => (string) get_option('woocommerce_store_address', ''),
            'address_2' => (string) get_option('woocommerce_store_address_2', ''),
            'city' => (string) get_option('woocommerce_store_city', ''),
            'postcode' => (string) get_option('woocommerce_store_postcode', '')];
    }

    public static function phone(string $value, string $country): string
    {
        if ($value === '') return '';
        try {
            $util = PhoneNumberUtil::getInstance();
            $number = $util->parse($value, $country);
            if (!$util->isValidNumber($number) || $number->hasExtension()) throw new \InvalidArgumentException();
            return $util->format($number, PhoneNumberFormat::E164);
        } catch (\Exception $error) { throw new CheckoutError('Enter a valid phone number, including its country code.'); }
    }

    public static function address(array $value, string $kind, bool $requireName = true): array
    {
        self::keys($value, self::ADDRESS);
        $clean = [];
        foreach ($value as $key => $field) $clean[$key] = self::text($field);
        $country = strtoupper($clean['country'] ?? '');
        if (!isset(WC()->countries->get_countries()[$country])) throw new CheckoutError('Choose a valid ' . $kind . ' country.');
        $clean['country'] = $country;
        $definitions = WC()->countries->get_address_fields($country, $kind . '_');
        foreach ($definitions as $key => $definition) {
            $field = substr($key, strlen($kind) + 1);
            if (in_array($field, ['email', 'phone'], true)) continue;
            if (!$requireName && in_array($field, ['first_name', 'last_name'], true)) continue;
            if (!empty($definition['required']) && empty($clean[$field])) {
                throw new CheckoutError(sprintf('%s: %s is required.', ucfirst($kind), wp_strip_all_tags($definition['label'])));
            }
        }
        $states = WC()->countries->get_states($country);
        if (is_array($states) && $states && !isset($states[$clean['state'] ?? ''])) throw new CheckoutError('Choose a valid ' . $kind . ' state.');
        if (!empty($clean['postcode']) && !\WC_Validation::is_postcode($clean['postcode'], $country)) throw new CheckoutError('Enter a valid ' . $kind . ' postcode.');
        return $clean;
    }

    public static function items(mixed $value, bool $allowEmpty = false): array
    {
        if (!is_array($value) || (!$value && !$allowEmpty) || count($value) > 100) throw new CheckoutError('Add between 1 and 100 items.');
        $items = [];
        foreach ($value as $item) {
            if (!is_array($item)) throw new CheckoutError('Invalid sale item.');
            self::keys($item, ['id', 'quantity']);
            if (!is_int($item['id'] ?? null) || $item['id'] < 1 || !is_int($item['quantity'] ?? null) || $item['quantity'] < 1 || $item['quantity'] > 10000) throw new CheckoutError('Item IDs and quantities must be positive integers.');
            $items[$item['id']] = ($items[$item['id']] ?? 0) + $item['quantity'];
            if ($items[$item['id']] > 10000) throw new CheckoutError('Item quantity is too large.');
        }
        ksort($items);
        return $items;
    }

    public static function checkout(array $body): array
    {
        self::keys($body, ['items', 'contact', 'billing', 'shipping', 'rates', 'sale_id', 'fingerprint', 'method']);
        $items = self::items($body['items'] ?? null);
        $fields = Settings::checkoutFields();
        $contact = $body['contact'] ?? [];
        if (!is_array($contact)) throw new CheckoutError('Invalid customer details.');
        self::keys($contact, self::CONTACT);
        foreach (self::CONTACT as $field) {
            $contact[$field] = self::text($contact[$field] ?? '');
            if ($fields[$field] && $contact[$field] === '') throw new CheckoutError(ucfirst(str_replace('_', ' ', $field)) . ' is required.');
        }
        if ($contact['email'] !== '' && !is_email($contact['email'])) throw new CheckoutError('Enter a valid email address.');
        if ($contact['email'] !== '' && str_ends_with(strtolower($contact['email']), '.invalid')) throw new CheckoutError('A real customer email is required.');
        $contact['email'] = strtolower($contact['email']);
        $addresses = [];
        $sources = [];
        foreach (['billing', 'shipping'] as $kind) {
            $value = $body[$kind] ?? [];
            if (!is_array($value)) throw new CheckoutError('Invalid address.');
            if (!$value && $fields[$kind]) throw new CheckoutError(ucfirst($kind) . ' address is required.');
            $sources[$kind] = $value ? 'customer' : 'store';
            try { $addresses[$kind] = self::address($value ?: Input::storeAddress(), $kind, (bool) $value); }
            catch (CheckoutError $error) {
                if (!$value) throw new CheckoutError('The store address is incomplete. Configure it in WooCommerce Settings → General before using address fallback.', 409);
                throw $error;
            }
        }
        $contact['phone'] = self::phone($contact['phone'], $addresses['billing']['country']);
        $rates = $body['rates'] ?? [];
        if (!is_array($rates) || count($rates) > 100) throw new CheckoutError('Invalid shipping selection.');
        $rates = array_map(static fn($rate) => self::text($rate), $rates);
        return compact('items', 'contact', 'addresses', 'sources', 'rates');
    }
}
