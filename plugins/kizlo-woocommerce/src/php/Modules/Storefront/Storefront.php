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

        $fields = Package::container()->get(CheckoutFields::class);

        return [
            'countries'              => $countries,
            'default_address_format' => $formats['default'],
            'fields'                 => (object) array_map(
                [$this, 'serializableField'],
                array_merge($fields->get_core_fields(), $fields->get_additional_fields()),
            ),
            'field_locations'        => [
                'address' => array_values($fields->get_address_fields_keys()),
                'contact' => array_values($fields->get_contact_fields_keys()),
                'order'   => array_values($fields->get_order_fields_keys()),
            ],
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
    private function serializableField(array $field): array
    {
        unset($field['sanitize_callback'], $field['validate_callback']);

        return $field;
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
                'enabled' => (bool) $pickup['enabled'],
                'title'   => (string) $pickup['title'],
                'cost'    => (string) $pickup['cost'],
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
