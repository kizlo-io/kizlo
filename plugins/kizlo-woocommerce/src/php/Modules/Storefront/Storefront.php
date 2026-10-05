<?php

namespace Kizlo\WooCommerce\Modules\Storefront;

use Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields;
use Automattic\WooCommerce\Blocks\Package;
use Automattic\WooCommerce\Blocks\Utils\CartCheckoutUtils;
use Automattic\WooCommerce\StoreApi\Formatters\CurrencyFormatter;
use Automattic\WooCommerce\StoreApi\Utilities\LocalPickupUtils;

/**
 * The store-wide settings a storefront renders with, read the way WooCommerce
 * Blocks reads them for its Cart and Checkout `wcSettings` hydration.
 *
 * Where Blocks already has a builder, it is called rather than re-derived from
 * raw options, so filters and plugin-registered fields apply and the shape moves
 * with WooCommerce. Nothing here may depend on the visitor: the result is cached
 * for every request in a locale.
 */
class Storefront
{
    /** @return array<string, mixed> */
    public function build(): array
    {
        return [
            'address'  => $this->address(),
            'checkout' => $this->checkout(),
            'pricing'  => $this->pricing(),
            'catalog'  => $this->catalog(),
        ];
    }

    /** @return array<string, mixed> */
    private function address(): array
    {
        $names   = WC()->countries->get_countries();
        $formats = WC()->countries->get_address_formats();

        $countries = [];
        foreach (CartCheckoutUtils::get_country_data() as $code => $data) {
            $countries[] = [
                'code'          => (string) $code,
                'name'          => html_entity_decode((string) ($names[$code] ?? $code)),
                'allowBilling'  => $data['allowBilling'],
                'allowShipping' => $data['allowShipping'],
                'states'        => $this->states($data['states']),
                'locale'        => (object) $data['locale'],
                'format'        => $formats[$code] ?? $formats['default'],
            ];
        }

        $service = Package::container()->get(CheckoutFields::class);
        $definitions = array_merge($service->get_core_fields(), $service->get_additional_fields());
        $fields = [];
        foreach (['address' => $service->get_address_fields_keys(), 'contact' => $service->get_contact_fields_keys(), 'order' => $service->get_order_fields_keys()] as $location => $ids) {
            foreach ($ids as $id) {
                if (isset($definitions[$id])) $fields[] = $this->serializableField($definitions[$id], (string) $id, $location);
            }
        }

        return [
            'countries'              => $countries,
            'default_address_format' => $formats['default'],
            'fields'                 => $fields,
            'base_country'           => WC()->countries->get_base_country(),
            // Geolocation resolves against the request, which here is the Kizlo
            // server rather than the shopper, so only a fixed default is reported.
            'default_country'        => get_option('woocommerce_default_customer_address') === 'base'
                ? WC()->countries->get_base_country()
                : null,
        ];
    }

    /**
     * A list rather than a map: JavaScript moves integer-like keys such as Japan's
     * "13" ahead of the rest, so a map would lose WooCommerce's order on parse.
     * WooCommerce answers `false` for a country whose state field is not a list,
     * which is the same thing as no states to choose from.
     *
     * @return list<array{code: string, name: string}>
     */
    private function states(mixed $states): array
    {
        if (! is_array($states)) return [];

        $list = [];
        foreach ($states as $code => $name) {
            $list[] = ['code' => (string) $code, 'name' => html_entity_decode((string) $name)];
        }

        return $list;
    }

    /**
     * Additional fields carry their PHP callbacks, which mean nothing to a client
     * and do not survive JSON encoding.
     *
     * @param array<string, mixed> $field
     * @return array<string, mixed>
     */
    private function serializableField(array $field, string $id, string $location): array
    {
        $attributes = is_array($field['attributes'] ?? null) ? $field['attributes'] : [];
        foreach (['autocomplete', 'autocapitalize', 'placeholder'] as $attribute) {
            if (isset($field[$attribute])) $attributes[$attribute] = $field[$attribute];
        }
        $schema = ['type' => ($field['type'] ?? 'text') === 'checkbox' ? 'boolean' : 'string'];
        if ($id === 'email') $schema['format'] = 'email';
        foreach (['maxLength', 'minLength'] as $constraint) {
            $length = $attributes[$constraint] ?? null;
            // Woo sanitizes HTML attributes to strings. Schema lengths must be nonnegative integers.
            if ((is_int($length) || is_string($length)) && preg_match('/^[0-9]+$/D', (string) $length) && (float) $length <= 9007199254740991) {
                $schema[$constraint] = (int) $length;
            }
        }
        if (isset($attributes['pattern']) && is_string($attributes['pattern'])) {
            $pattern = html_entity_decode($attributes['pattern'], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            // HTML patterns match the entire value. Unicode set operations are not portable to draft-07.
            if ($this->portableHtmlPattern($pattern)) {
                $schema['pattern'] = '^(?:' . $pattern . ')$';
            }
        }
        // Woo's validation describes this field value, not the whole checkout document.
        if (!empty($field['validation']) && is_array($field['validation'])) {
            $schema = ['allOf' => [(object) $schema, (object) $field['validation']]];
        }
        unset($field['sanitize_callback'], $field['validate_callback'], $field['validation']);
        $field['id'] = $id;
        $field['location'] = $location;
        $field['attributes'] = (object) $attributes;
        $field['schema'] = (object) $schema;
        $field['required'] = $this->condition($field['required'] ?? false);
        $field['hidden'] = $this->condition($field['hidden'] ?? false);
        return $field;
    }

    /** Only promote patterns whose syntax is shared by HTML, ECMAScript draft-07 and PHP. */
    private function portableHtmlPattern(string $pattern): bool
    {
        $inClass = false;
        for ($i = 0, $length = strlen($pattern); $i < $length; $i++) {
            $char = $pattern[$i];
            if ($char === '\\') {
                $escaped = $pattern[++$i] ?? '';
                if ($escaped === '' || !str_contains('dDsSwWbBfnrt\\^$.*+?()[]{}|/', $escaped) && !($inClass && $escaped === '-')) return false;
                continue;
            }
            if ($char === '[') {
                if ($inClass) return false;
                $inClass = true;
            } elseif ($char === ']') {
                if (!$inClass) return false;
                $inClass = false;
            } elseif ($inClass) {
                // Complex Unicode sets and reserved class punctuation need a different regex dialect.
                if (ord($char) < 128 && !ctype_alnum($char) && !str_contains('^_- ', $char)) return false;
                if ($char === '-' && ($pattern[$i + 1] ?? '') === '-') return false;
            } elseif ($char === '(' && ($pattern[$i + 1] ?? '') === '?') {
                if (($pattern[$i + 2] ?? '') !== ':') return false;
                $i += 2;
            } elseif ($char === '(' && ($pattern[$i + 1] ?? '') === '*') {
                return false;
            } elseif ($char === '{') {
                if (!preg_match('/^\{[0-9]+(?:,[0-9]*)?\}/', substr($pattern, $i), $match)) return false;
                $i += strlen($match[0]) - 1;
                if (($pattern[$i + 1] ?? '') === '+') return false;
            } elseif ($char === '}' || str_contains('*+?', $char) && ($pattern[$i + 1] ?? '') === '+') {
                return false;
            }
        }
        return !$inClass && @preg_match('~(?:' . str_replace('~', '\\~', $pattern) . ')~u', '') !== false;
    }

    private function condition(mixed $rule): mixed
    {
        if (!is_array($rule)) return is_bool($rule) ? $rule : false;
        if (!$rule) return false;
        if (isset($rule['cart']) || isset($rule['customer']) || isset($rule['checkout'])) {
            return ['$schema' => 'http://json-schema.org/draft-07/schema#', 'type' => 'object', 'properties' => (object) $rule];
        }
        return (object) $rule;
    }

    /** @return array<string, mixed> */
    private function checkout(): array
    {
        $pickup = LocalPickupUtils::get_local_pickup_settings();

        return [
            'allows_guest'                      => ! filter_var(WC()->checkout()->is_registration_required(), FILTER_VALIDATE_BOOLEAN),
            'coupons_enabled'                   => wc_coupons_enabled(),
            'forced_billing_address'            => get_option('woocommerce_ship_to_destination') === 'billing_only',
            'taxes_enabled'                     => wc_tax_enabled(),
            'display_cart_prices_including_tax' => get_option('woocommerce_tax_display_cart') === 'incl',
            'display_itemized_taxes'            => get_option('woocommerce_tax_total_display') === 'itemized',
            'shipping_enabled'                  => wc_shipping_enabled(),
            'local_pickup'                      => [
                'enabled'    => (bool) $pickup['enabled'],
                'title'      => (string) $pickup['title'],
                'cost'       => (string) $pickup['cost'],
                'method_ids' => LocalPickupUtils::get_local_pickup_method_ids(),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function pricing(): array
    {
        return [
            'currency'                          => (new CurrencyFormatter())->format([]),
            'prices_include_tax'                => wc_prices_include_tax(),
            'display_shop_prices_including_tax' => get_option('woocommerce_tax_display_shop') === 'incl',
            'price_suffix'                      => (string) get_option('woocommerce_price_display_suffix', ''),
        ];
    }

    /** @return array<string, mixed> */
    private function catalog(): array
    {
        return [
            'weight_unit'                  => (string) get_option('woocommerce_weight_unit'),
            'dimension_unit'               => (string) get_option('woocommerce_dimension_unit'),
            'reviews_enabled'              => wc_reviews_enabled(),
            'review_ratings_enabled'       => wc_review_ratings_enabled(),
            'review_rating_required'       => wc_review_ratings_required(),
            'reviews_verified_owners_only' => get_option('woocommerce_review_rating_verification_required') === 'yes',
            'stock_format'                 => (string) get_option('woocommerce_stock_format'),
            'hide_out_of_stock'            => get_option('woocommerce_hide_out_of_stock_items') === 'yes',
            'placeholder_image'            => wc_placeholder_img_src(),
            'cart_redirect_after_add'      => get_option('woocommerce_cart_redirect_after_add') === 'yes',
        ];
    }
}
