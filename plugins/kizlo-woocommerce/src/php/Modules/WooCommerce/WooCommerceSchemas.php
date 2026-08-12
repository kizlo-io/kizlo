<?php

namespace Kizlo\WooCommerce\Modules\WooCommerce;

/**
 * What this plugin's routes return.
 *
 * Two of these bodies are WooCommerce's own: the product object the WooCommerce
 * REST API prepares, and the Store API cart. Both are described as objects with
 * their extra Kizlo fields named and everything else left open, deliberately.
 * Copying WooCommerce's field list into Kizlo's contract would create exactly
 * the second source of truth this contract exists to remove, and it would go
 * stale on a WooCommerce release rather than on a change here.
 *
 * The IDs are vendor-qualified because this is not the Kizlo plugin: `kizlo.*`
 * is reserved for core, and registering into it from out here fails.
 */
final class WooCommerceSchemas
{
    /**
     * The Kizlo error envelope, by ID rather than through the class that builds
     * it: this plugin talks to Kizlo through the public functions, and referring
     * to a core class here would make it a load-order problem.
     */
    public const ERROR = 'kizlo.error';

    public const PRODUCT       = 'woocommerce.product';
    public const CART          = 'woocommerce.cart';
    public const STOCK_RESULT  = 'woocommerce.stock-result';
    public const REVIEW_EXISTS = 'woocommerce.review-exists';

    public static function register(): void
    {
        foreach (self::all() as $id => $schema) {
            kizlo_register_spec_schema($id, $schema);
        }
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            self::PRODUCT       => self::product(),
            self::CART          => self::cart(),
            self::STOCK_RESULT  => self::stockResult(),
            self::REVIEW_EXISTS => self::reviewExists(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function product(): array
    {
        return [
            'type'                 => 'object',
            'description'          => 'A WooCommerce product, as WooCommerce prepares it. Its fields are the WooCommerce REST API\'s and are documented there.',
            'additionalProperties' => true,
            'properties'           => [
                'id' => ['type' => 'integer', 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function cart(): array
    {
        return [
            'type'                 => 'object',
            'description'          => 'The Store API cart, plus the two fields the headless session adds.',
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
     * @return array<string, mixed>
     */
    private static function reviewExists(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'exists' => ['type' => 'boolean', 'required' => true, 'description' => 'Whether the user has an approved review on the product.'],
            ],
        ];
    }
}
