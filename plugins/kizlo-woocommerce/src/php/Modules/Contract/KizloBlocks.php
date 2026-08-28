<?php

namespace Kizlo\WooCommerce\Modules\Contract;

use Kizlo\Modules\Introspection\CustomFieldSchema;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;

/**
 * The fields this plugin adds to WooCommerce's own responses.
 *
 * Everything else in the WooCommerce contract is derived from WooCommerce, which
 * is the point of {@see StoreApiRoutes} and {@see RestApiRoutes}. These blocks
 * cannot be: they are this plugin's additions, so no WooCommerce schema mentions
 * them and nothing but this file knows their shape.
 *
 * There are three, added three different ways, and the difference decides where
 * each one is described:
 *
 * - The Store API product gets `extensions.kizlo` through
 *   `woocommerce_store_api_register_endpoint_data()`, which takes a schema
 *   callback. {@see \Kizlo\WooCommerce\Modules\Product\ProductModule} hands it
 *   {@see self::storeProduct()}, so WooCommerce publishes the block itself and
 *   the derivation picks it up with everything else. Nothing here is merged into
 *   that spec by hand.
 * - The REST v3 product gets `kizlo` through `woocommerce_rest_prepare_product_object`,
 *   a response filter with no schema half at all.
 * - Store API collection data gets `kizlo` through a Kizlo route interceptor,
 *   which is a response filter by another name.
 *
 * The last two have nowhere to be declared, so the route specs merge them in.
 *
 * The REST v3 and collection blocks remain open because their extension hooks
 * can add fields that this plugin cannot describe ahead of time.
 */
final class KizloBlocks
{
    /**
     * `extensions.kizlo` on a Store API product.
     *
     * @return array<string, mixed>
     */
    public static function storeProduct(): array
    {
        return [
            'url' => [
                'description' => 'The headless product URL resolved from Kizlo post type settings, or null when unavailable.',
                'type'        => ['string', 'null'],
                'context'     => ['view', 'edit', 'embed'],
                'readonly'    => true,
            ],
            'term_urls' => [
                'description' => 'Headless URLs for the product category, tag, and brand relationships.',
                'type'        => 'array',
                'context'     => ['view', 'edit', 'embed'],
                'readonly'    => true,
                'items'       => [
                    'type'       => 'object',
                    'properties' => [
                        'id'       => ['type' => 'integer', 'required' => true],
                        'taxonomy' => ['type' => 'string', 'required' => true],
                        'url'      => ['type' => 'string', 'required' => true],
                    ],
                ],
            ],
            'stock' => [
                'description' => 'Stock quantity, or null when the product does not manage stock.',
                'type'        => ['integer', 'null'],
                'context'     => ['view', 'edit'],
                'readonly'    => true,
            ],
            'on_sale_from' => [
                'description' => 'When the sale price starts applying, as RFC 3339 UTC.',
                'type'        => ['string', 'null'],
                'format'      => 'date-time',
                'context'     => ['view', 'edit'],
                'readonly'    => true,
            ],
            'on_sale_to' => [
                'description' => 'When the sale price stops applying, as RFC 3339 UTC.',
                'type'        => ['string', 'null'],
                'format'      => 'date-time',
                'context'     => ['view', 'edit'],
                'readonly'    => true,
            ],
            'seo' => [
                'description' => 'Kizlo SEO for a single unlocked product, or null when SEO is disabled or the product is locked.',
                'type'        => ['object', 'null'],
                'context'     => ['view', 'edit'],
                'readonly'    => true,
            ],
            'custom' => array_merge(self::customFields(), [
                'context'  => ['view', 'edit'],
                'readonly' => true,
            ]),
        ];
    }

    /**
     * `kizlo` on a REST v3 product.
     *
     * Prices are minor units here and strings on the product itself, because
     * `extendProduct()` multiplies by the currency's minor unit and casts to int.
     * Describing them as the integers they are is the whole reason to declare the
     * block rather than leave it open.
     *
     * @return array<string, mixed>
     */
    public static function restProduct(): array
    {
        return [
            'type'                 => 'object',
            'required'             => true,
            'additionalProperties' => true,
            'description'          => 'Fields Kizlo adds to the WooCommerce product response.',
            'properties'           => [
                'attributes' => [
                    'type'        => 'array',
                    'required'    => true,
                    'description' => 'Product attributes, with their terms resolved.',
                    'items'       => [
                        'type'       => 'object',
                        'properties' => [
                            'id'             => ['type' => 'integer', 'required' => true],
                            'name'           => ['type' => 'string', 'required' => true],
                            'taxonomy'       => ['type' => 'string', 'required' => true, 'nullable' => true, 'description' => 'Null for a custom attribute, which is not a taxonomy.'],
                            'has_variations' => ['type' => 'boolean', 'required' => true],
                            'terms'          => [
                                'type'     => 'array',
                                'required' => true,
                                'items'    => [
                                    'type'       => 'object',
                                    'properties' => [
                                        'id'   => ['type' => 'integer', 'required' => true, 'description' => 'Zero for a custom attribute option, which has no term behind it.'],
                                        'name' => ['type' => 'string', 'required' => true],
                                        'slug' => ['type' => 'string', 'required' => true],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
                'variations' => [
                    'type'        => 'array',
                    'required'    => true,
                    'description' => 'Every variation of this product, with the attributes that select it.',
                    'items'       => [
                        'type'       => 'object',
                        'properties' => [
                            'id'         => ['type' => 'integer', 'required' => true],
                            'attributes' => [
                                'type'     => 'array',
                                'required' => true,
                                'items'    => [
                                    'type'       => 'object',
                                    'properties' => [
                                        'name'  => ['type' => 'string', 'required' => true],
                                        'value' => ['type' => 'string', 'required' => true],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
                'prices' => [
                    'type'        => 'object',
                    'required'    => true,
                    'description' => 'Prices in the currency\'s minor unit, matching how the Store API reports them.',
                    'properties'  => [
                        'price'         => ['type' => 'integer', 'required' => true],
                        'regular_price' => ['type' => 'integer', 'required' => true],
                        'sale_price'    => ['type' => 'integer', 'required' => true, 'nullable' => true, 'description' => 'Null unless the product is currently on sale.'],
                    ],
                ],
                'currency_format' => ['$ref' => WooCommerceSchemas::CURRENCY_FORMAT, 'required' => true],
                'custom'          => self::customFields(),
                'store_product' => [
                    '$ref'        => WooCommerceSchemas::STORE_PRODUCT,
                    'required'    => true,
                    'description' => 'The same Store API product shape published reads use, added so a draft preview can share their deserializer.',
                ],
            ],
        ];
    }

    /**
     * `kizlo` on Store API collection data.
     *
     * WooCommerce counts terms and returns their IDs. This resolves each one to
     * the term itself, and adds the swatch an attribute term carries so a filter
     * UI can render colours and images without a second round trip.
     *
     * @return array<string, mixed>
     */
    public static function collectionData(): array
    {
        return [
            'type'                 => 'object',
            'required'             => true,
            'additionalProperties' => true,
            'description'          => 'Fields Kizlo adds to the WooCommerce collection data response.',
            'properties'           => [
                'taxonomy_counts' => [
                    'type'        => 'array',
                    'required'    => true,
                    'description' => 'One entry per counted term, with the term resolved. A term that no longer exists is dropped.',
                    'items'       => [
                        'type'       => 'object',
                        'properties' => self::term() + [
                            'image' => ['$ref' => 'kizlo.media-image', 'required' => true, 'nullable' => true, 'description' => 'The term\'s resolved `thumbnail_id` image, which only `product_cat` sets.'],
                        ],
                    ],
                ],
                'attribute_counts' => [
                    'type'        => 'array',
                    'required'    => true,
                    'description' => 'One entry per counted attribute term, with the term and its swatch resolved.',
                    'items'       => [
                        'type'       => 'object',
                        'properties' => self::term() + [
                            'swatch_type' => ['type' => 'string', 'required' => true, 'enum' => ['text', 'color', 'image'], 'description' => 'How the attribute is displayed, from the `kizlo_swatch_type_{id}` option.'],
                            'swatch'      => ['type' => 'string', 'required' => true, 'nullable' => true, 'description' => 'A colour for `color`, an image URL for `image`, null for `text`.'],
                        ],
                    ],
                ],
            ],
        ];
    }

    /**
     * The exact resolved custom-field schema configured for products.
     *
     * @return array<string, mixed>
     */
    private static function customFields(): array
    {
        $definitions = PostTypeSettings::load('product')->getCustomFields();

        return CustomFieldSchema::responseGroup($definitions);
    }

    /**
     * The term fields both count lists share.
     *
     * @return array<string, array<string, mixed>>
     */
    private static function term(): array
    {
        return [
            'id'          => ['type' => 'integer', 'required' => true],
            'name'        => ['type' => 'string', 'required' => true],
            'slug'        => ['type' => 'string', 'required' => true],
            'taxonomy'    => ['type' => 'string', 'required' => true],
            'description' => ['type' => 'string', 'required' => true],
            'parent'      => ['type' => 'integer', 'required' => true],
            'count'       => ['type' => 'integer', 'required' => true],
        ];
    }
}
