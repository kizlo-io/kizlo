<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

/**
 * Every schema ID this plugin's contract uses, and the handful of bodies that
 * are written here rather than derived.
 *
 * Most are not written here. {@see \Kizlo\WooCommerce\Modules\Contract\RestApiRoutes}
 * and {@see \Kizlo\WooCommerce\Modules\Contract\StoreApiRoutes} build theirs from
 * WooCommerce's own controllers, because copying WooCommerce's field lists into
 * Kizlo's contract would create exactly the second source of truth this contract
 * exists to remove, and it would go stale on a WooCommerce release rather than on
 * a change here. What is left below is what nothing upstream describes: the two
 * fields the headless session adds to a cart, the result of a stock adjustment,
 * and the store's currency formatting.
 *
 * The IDs live in one place because both halves reference them. They are
 * vendor-qualified because this is not the Kizlo plugin: `kizlo.*` is reserved
 * for core, and registering into it from out here fails.
 */
final class WooCommerceSchemas
{
    /**
     * The Kizlo error envelope, by ID rather than through the class that builds
     * it: this plugin talks to Kizlo through the public functions, and referring
     * to a core class here would make it a load-order problem.
     */
    public const ERROR = 'kizlo.error';

    /**
     * Bodies only a Kizlo route produces, so they sit under `kizlo` rather than
     * beside WooCommerce's own.
     *
     * The segment is what tells a reader which side of the boundary a name is on:
     * `woocommerce.kizlo.cart` is the cart this plugin's merge route answers with,
     * `woocommerce.store.cart` is the one WooCommerce serves. Without it the two
     * read as the same object, and they are not.
     */
    public const CART         = 'woocommerce.kizlo.cart';
    public const STOCK_RESULT = 'woocommerce.kizlo.stock-result';

    /**
     * WooCommerce's own, reshaped by nobody. `CurrencyFormatter` produces it and
     * the Store API puts it beside every price, so it is not Kizlo's to claim.
     */
    public const CURRENCY_FORMAT = 'woocommerce.currency-format';

    /** Derived from the WooCommerce REST v3 controllers. */
    public const PRODUCT  = 'woocommerce.product';
    public const CUSTOMER = 'woocommerce.customer';

    /** Derived from the WooCommerce Store API schema classes. */
    public const STORE_CART                    = 'woocommerce.store.cart';
    public const STORE_CHECKOUT                = 'woocommerce.store.checkout';
    public const STORE_CHECKOUT_ORDER          = 'woocommerce.store.checkout-order';
    public const STORE_PRODUCT                 = 'woocommerce.store.product';
    public const STORE_PRODUCT_SUMMARY         = 'woocommerce.store.product-summary';
    public const STORE_PRODUCT_DETAIL          = 'woocommerce.store.product-detail';
    public const STORE_PRODUCT_COLLECTION_DATA = 'woocommerce.store.product-collection-data';

    public static function register(): void
    {
        kizlo_register_route_schema(self::CART, static fn(): array => self::cart());
        kizlo_register_route_schema(self::STOCK_RESULT, static fn(): array => self::stockResult());
        kizlo_register_route_schema(self::CURRENCY_FORMAT, static fn(): array => self::currencyFormat());
    }

    /**
     * @return array<string, mixed>
     */
    private static function cart(): array
    {
        return [
            'type'                 => 'object',
            'description'          => 'The Store API cart, plus the two fields the headless session adds. Its WooCommerce half is described in full by woocommerce.store.cart.',
            'additionalProperties' => true,
            'properties'           => [
                'guest_token' => [
                    'type'        => 'string',
                    'required'    => true,
                    'description' => 'The guest cart token this session is keyed to. Empty once the cart belongs to a user.',
                ],
                'user_id'     => [
                    'type'        => 'integer',
                    'required'    => true,
                    'nullable'    => true,
                    'description' => 'The resolved cart owner, or null for a guest cart.',
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function stockResult(): array
    {
        return [
            'type'        => 'object',
            'description' => 'The outcome of a stock adjustment.',
            'properties'  => [
                'success'  => ['type' => 'boolean', 'required' => true],
                'message'  => ['type' => 'string', 'required' => true],
                'order_id' => ['type' => 'integer', 'required' => true],
                'action'   => ['type' => 'string', 'required' => true, 'enum' => ['reduce', 'increase']],
            ],
        ];
    }

    /**
     * How to render a price, as `WC_Currency_Formatter` reports it.
     *
     * Declared rather than derived because WooCommerce keeps this behind a
     * protected `get_store_currency_properties()` on its Store API schema base,
     * so there is nothing public to ask. It is the same seven fields the Store
     * API puts beside every price it returns.
     *
     * @return array<string, mixed>
     */
    private static function currencyFormat(): array
    {
        return [
            'type'        => 'object',
            'description' => 'The store currency and how to format an amount in it.',
            'properties'  => [
                'currency_code'               => ['type' => 'string', 'required' => true, 'description' => 'ISO 4217 code, e.g. GBP.'],
                'currency_symbol'             => ['type' => 'string', 'required' => true],
                'currency_minor_unit'         => ['type' => 'integer', 'required' => true, 'description' => 'Decimal places. Prices are integers in this many minor units.'],
                'currency_decimal_separator'  => ['type' => 'string', 'required' => true],
                'currency_thousand_separator' => ['type' => 'string', 'required' => true],
                'currency_prefix'             => ['type' => 'string', 'required' => true],
                'currency_suffix'             => ['type' => 'string', 'required' => true],
            ],
        ];
    }

}
