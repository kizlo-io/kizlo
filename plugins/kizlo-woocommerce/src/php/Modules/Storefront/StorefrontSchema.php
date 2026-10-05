<?php

namespace Kizlo\WooCommerce\Modules\Storefront;

use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;

/**
 * The storefront settings body. Written here because nothing upstream describes
 * it: WooCommerce Blocks only ever prints these values into the page.
 */
final class StorefrontSchema
{
    public const ID = 'woocommerce.kizlo.storefront-settings';

    public static function register(): void
    {
        kizlo_register_route_schema(self::ID, static fn(): array => self::storefront());
    }

    /** @return array<string, mixed> */
    private static function storefront(): array
    {
        return [
            'type'        => 'object',
            'description' => 'The store settings a storefront renders with.',
            'properties'  => [
                'address'  => ['required' => true] + self::address(),
                'checkout' => ['required' => true] + self::checkout(),
                'pricing'  => ['required' => true] + self::pricing(),
                'catalog'  => ['required' => true] + self::catalog(),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function address(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Where the store sells and ships, and how its address form is built.',
            'properties'  => [
                'countries'              => [
                    'type'        => 'array',
                    'required'    => true,
                    'description' => 'Every country the store sells or ships to, sorted by name.',
                    'items'       => self::country(),
                ],
                'default_address_format' => ['type' => 'string', 'required' => true, 'description' => 'The address format for countries without their own.'],
                'fields'                 => [
                    'type' => 'array', 'required' => true,
                    'description' => 'Complete core and registered field definitions, with their location and JSON Schema.',
                    'items' => self::field(),
                ],
                'base_country'           => ['type' => 'string', 'required' => true, 'description' => 'The country the store is based in.'],
                'default_country'        => [
                    'type'        => 'string',
                    'nullable'    => true,
                    'required'    => true,
                    'description' => 'The country a new customer starts with, or null when the store geolocates or sets none.',
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function country(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'code'          => ['type' => 'string', 'required' => true, 'description' => 'ISO 3166-1 alpha-2 code.'],
                'name'          => ['type' => 'string', 'required' => true],
                'allowBilling'  => ['type' => 'boolean', 'required' => true],
                'allowShipping' => ['type' => 'boolean', 'required' => true],
                'states'        => [
                    'type'        => 'array',
                    'required'    => true,
                    'description' => 'The states to choose from, in WooCommerce\'s order. Empty when the country has no list.',
                    'items'       => [
                        'type'       => 'object',
                        'properties' => [
                            'code' => ['type' => 'string', 'required' => true],
                            'name' => ['type' => 'string', 'required' => true],
                        ],
                    ],
                ],
                'locale'        => [
                    'type'                 => 'object',
                    'required'             => true,
                    'description'          => 'Per-field overrides of the default field definitions for this country.',
                    'additionalProperties' => self::fieldOverride(),
                ],
                'format'        => ['type' => 'string', 'required' => true, 'description' => 'How an address in this country is printed, with {placeholders}.'],
            ],
        ];
    }

    /**
     * A plugin-registered field may make `required` or `hidden` a JSON Schema rule
     * evaluated against the checkout, rather than a fixed boolean.
     *
     * @return array<string, mixed>
     */
    private static function rule(): array
    {
        return ['anyOf' => [['type' => 'boolean'], ['type' => 'object', 'additionalProperties' => true]]];
    }

    /** @return array<string, mixed> */
    private static function fieldOverride(): array
    {
        return [
            'type'                 => 'object',
            'additionalProperties' => true,
            'properties'           => [
                'label'    => ['type' => 'string'],
                'required' => ['type' => 'boolean'],
                'hidden'   => ['type' => 'boolean'],
                'index'    => ['type' => 'integer'],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function field(): array
    {
        return [
            'type'                 => 'object',
            'additionalProperties' => true,
            'properties'           => [
                'id'             => ['type' => 'string', 'required' => true],
                'attributes'     => ['type' => 'object', 'required' => true, 'additionalProperties' => true],
                'schema'         => ['required' => true] + self::rule(),
                'label'          => ['type' => 'string', 'required' => true],
                'optionalLabel'  => ['type' => 'string', 'required' => true],
                'required'       => ['required' => true] + self::rule(),
                'hidden'         => ['required' => true] + self::rule(),
                'type'           => ['type' => 'string'],
                'autocomplete'   => ['type' => 'string'],
                'autocapitalize' => ['type' => 'string'],
                'index'          => ['type' => 'integer'],
                'location'       => ['type' => 'string', 'required' => true, 'enum' => ['address', 'contact', 'order']],
                'placeholder'    => ['type' => 'string'],
                'options'        => [
                    'type'  => 'array',
                    'items' => [
                        'type'       => 'object',
                        'properties' => [
                            'value' => ['type' => 'string', 'required' => true],
                            'label' => ['type' => 'string', 'required' => true],
                        ],
                    ],
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function checkout(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'allows_guest'                      => ['type' => 'boolean', 'required' => true],
                'coupons_enabled'                   => ['type' => 'boolean', 'required' => true],
                'forced_billing_address'            => ['type' => 'boolean', 'required' => true, 'description' => 'The store ships only to the billing address.'],
                'taxes_enabled'                     => ['type' => 'boolean', 'required' => true],
                'display_cart_prices_including_tax' => ['type' => 'boolean', 'required' => true],
                'display_itemized_taxes'            => ['type' => 'boolean', 'required' => true, 'description' => 'One line per tax rate rather than a single total.'],
                'shipping_enabled'                  => ['type' => 'boolean', 'required' => true],
                'local_pickup'                      => [
                    'type'       => 'object',
                    'required'   => true,
                    'properties' => [
                        'enabled'    => ['type' => 'boolean', 'required' => true],
                        'title'      => ['type' => 'string', 'required' => true],
                        'cost'       => ['type' => 'string', 'required' => true],
                        'method_ids' => [
                            'type'        => 'array',
                            'required'    => true,
                            'items'       => ['type' => 'string'],
                            'description' => 'Shipping method IDs supporting local pickup, including plugin methods.',
                        ],
                    ],
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function pricing(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'currency'                          => ['$ref' => WooCommerceSchemas::CURRENCY_FORMAT, 'required' => true],
                'prices_include_tax'                => ['type' => 'boolean', 'required' => true, 'description' => 'Prices are entered with tax included.'],
                'display_shop_prices_including_tax' => ['type' => 'boolean', 'required' => true],
                'price_suffix'                      => ['type' => 'string', 'required' => true],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function catalog(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'weight_unit'                  => ['type' => 'string', 'required' => true],
                'dimension_unit'               => ['type' => 'string', 'required' => true],
                'reviews_enabled'              => ['type' => 'boolean', 'required' => true],
                'review_ratings_enabled'       => ['type' => 'boolean', 'required' => true],
                'review_rating_required'       => ['type' => 'boolean', 'required' => true],
                'reviews_verified_owners_only' => ['type' => 'boolean', 'required' => true],
                'stock_format'                 => ['type' => 'string', 'required' => true, 'description' => 'WooCommerce\'s stock display setting: "", "low_amount" or "no_amount".'],
                'hide_out_of_stock'            => ['type' => 'boolean', 'required' => true],
                'placeholder_image'            => ['type' => 'string', 'required' => true],
                'cart_redirect_after_add'      => ['type' => 'boolean', 'required' => true],
            ],
        ];
    }
}
