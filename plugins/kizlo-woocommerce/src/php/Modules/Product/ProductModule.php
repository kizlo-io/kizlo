<?php

namespace Kizlo\WooCommerce\Modules\Product;

use WP_Term;
use WP_Comment;
use WC_Product;
use WC_Product_Attribute;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\WooCommerce\Modules\Contract\KizloBlocks;
use Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema;
use Automattic\WooCommerce\StoreApi\Formatters\CurrencyFormatter;

class ProductModule
{
    public function __construct() {}

    public function register(): void
    {
        add_action('woocommerce_blocks_loaded', [$this, 'extendStoreApiProductSchema']);
        add_filter('wp_insert_comment', [$this, 'injectReviewUserIdBeforeInsert'], PHP_INT_MAX, 2);

        (new ProductController($this))->register();
    }

    public function extendProduct(array $data, WC_Product $product): array
    {
        $formatter     = new CurrencyFormatter();
        $currency_data = $formatter->format([]);
        $decimals = $currency_data['currency_minor_unit'];
        $multiplier    = 10 ** $decimals;

        $to_minor_unit = fn(string $price): int => (int) round((float) $price * $multiplier);

        $attributes = array_values(array_map(function (WC_Product_Attribute $attribute) {
            $taxonomy = $attribute->get_taxonomy();
            $options  = $attribute->get_options();

            $terms = array_map(function ($option) use ($attribute, $taxonomy) {
                if ($attribute->is_taxonomy()) {
                    $term = get_term($option, $taxonomy);
                    return [
                        'id'   => $term ? $term->term_id : 0,
                        'name' => $term ? $term->name : $option,
                        'slug' => $term ? $term->slug : $option,
                    ];
                }

                return [
                    'id'   => 0,
                    'name' => $option,
                    'slug' => $option,
                ];
            }, $options);

            return [
                'id'             => $attribute->get_id(),
                'name'           => $attribute->is_taxonomy() ? wc_attribute_label($taxonomy) : $attribute->get_name(),
                'taxonomy'       => $attribute->is_taxonomy() ? $taxonomy : null,
                'has_variations' => $attribute->get_variation(),
                'terms'          => $terms,
            ];
        }, $product->get_attributes()));

        $variations = array_map(function ($variation_id) {
            $variation  = wc_get_product($variation_id);

            $attributes = array_map(function ($name, $value) {
                $taxonomy = str_replace('attribute_', '', $name);

                return [
                    'name'  => wc_attribute_label($taxonomy),
                    'value' => $value,
                ];
            }, array_keys($variation->get_attributes()), $variation->get_attributes());

            return [
                'id'         => $variation_id,
                'attributes' => $attributes,
            ];
        }, $product->get_children());

        $data['kizlo'] = array_merge([
            'attributes' => $attributes,
            'variations' => $variations,
            'currency_format'  => $currency_data,
            'prices'           => [
                'price'         => $to_minor_unit($product->get_price()),
                'regular_price' => $to_minor_unit($product->get_regular_price()),
                'sale_price'    => $product->is_on_sale() ? $to_minor_unit($product->get_sale_price()) : null,
            ],
        ], kizlo_apply_extend_filter('product', $product), [
            'custom' => (object) $this->customFields($product),
        ]);

        return $data;
    }

    public function extendCategory(array $data, WP_Term $category): array
    {
        $data['kizlo'] = array_merge([], kizlo_apply_extend_filter('product_category', $category));

        return $data;
    }

    public function extendReview(array $data, WP_Comment $comment): array
    {
        $product_id = (int) get_comment_meta((int) $comment->comment_ID, 'rating', true)
            ? (int) $comment->comment_post_ID
            : 0;

        $product = wc_get_product($product_id);
        $customer_id = (int) $comment->user_id;
        $customer = get_userdata($customer_id);

        $featured_image_id = $product ? (int) get_post_thumbnail_id($product->get_id()) : 0;

        $data['kizlo'] = array_merge([
            'customer' => [
                'id'     => $customer_id,
                'name'   => $customer ? $customer->display_name : '',
                'avatar' => get_avatar_url($customer_id) ?: null,
            ],
            'product' => [
                'id'            => $product ? $product->get_id() : 0,
                'name'          => $product ? $product->get_name() : '',
                'slug'          => $product ? $product->get_slug() : '',
                'featured_image' => $featured_image_id ? kizlo_ensure_media_image_data($featured_image_id) : null,
            ],
        ], kizlo_apply_extend_filter('product_review', $comment));

        return $data;
    }

    public function extendCollection(array $data): array
    {
        /**
         * Enrich a single attribute_counts item with term data and swatch info.
         * Swatch type (text/color/image) is read from the attribute-level option
         * set during attribute creation. Color and image values are stored as term meta.
         */
        $enrich_attribute = function ($item) {
            $item = (array) $item;
            $term = get_term($item['term']);

            if (is_wp_error($term) || ! $term) {
                return null;
            }

            $attribute   = $this->_getAttributeByTaxonomy($term->taxonomy);
            $swatch_type = $attribute ? get_option("kizlo_swatch_type_{$attribute->attribute_id}", 'text') : 'text';

            $swatch = null;

            if ($swatch_type === 'color') {
                $swatch = get_term_meta($term->term_id, 'kizlo_term_color', true) ?: null;
            } elseif ($swatch_type === 'image') {
                $image_id = get_term_meta($term->term_id, 'kizlo_term_image', true);
                $swatch   = $image_id ? wp_get_attachment_image_url($image_id, 'full') : null;
            }

            return [
                'id'          => $term->term_id,
                'name'        => $term->name,
                'slug'        => $term->slug,
                'taxonomy'    => $term->taxonomy,
                'description' => $term->description,
                'parent'      => $term->parent,
                'count'       => $item['count'],
                'swatch_type' => $swatch_type,
                'swatch'      => $swatch,
            ];
        };

        /**
         * Enrich a single taxonomy_counts item (e.g. product_cat, product_tag)
         * with term data and its image. The attachment is stored as term meta
         * under `thumbnail_id`, a WooCommerce convention for product_cat.
         * Other taxonomies naturally return null.
         */
        $enrich_taxonomy = function ($item) {
            $item = (array) $item;
            $term = get_term($item['term']);

            if (is_wp_error($term) || ! $term) {
                return null;
            }

            $thumbnail_id = (int) get_term_meta($term->term_id, 'thumbnail_id', true);

            return [
                'id'          => $term->term_id,
                'name'        => $term->name,
                'slug'        => $term->slug,
                'taxonomy'    => $term->taxonomy,
                'description' => $term->description,
                'parent'      => $term->parent,
                'count'       => $item['count'],
                'image'       => $thumbnail_id ? kizlo_ensure_media_image_data($thumbnail_id) : null,
            ];
        };

        $data['kizlo'] = array_merge([
            'taxonomy_counts'  => array_values(array_filter(array_map($enrich_taxonomy, $data['taxonomy_counts'] ?? []))),
            'attribute_counts' => array_values(array_filter(array_map($enrich_attribute, $data['attribute_counts'] ?? []))),
        ], kizlo_apply_extend_filter('product_collection', $data));

        return $data;
    }

    public function extendStoreApiProductSchema(): void
    {
        woocommerce_store_api_register_endpoint_data([
            'namespace'       => 'kizlo',
            'endpoint'        => ProductSchema::IDENTIFIER,
            'data_callback'   => [$this, 'storeProductExtensionData'],
            // Without this, WooCommerce publishes the data and describes none of
            // it: get_endpoint_schema() skips an extension registered with no
            // schema callback. The Store API product spec derives its response
            // from that schema, so the four fields above would be returned and
            // described nowhere.
            'schema_callback' => [KizloBlocks::class, 'storeProduct'],
            'schema_type'     => ARRAY_A,
        ]);
    }

    /**
     * Kizlo-owned data attached to every Store API product context.
     *
     * @return array<string, mixed>
     */
    public function storeProductExtensionData(WC_Product $product): array
    {
        return array_merge([
            'stock'        => $product->get_stock_quantity(),
            'on_sale_from' => $this->qualifiedDate($product->get_date_on_sale_from()),
            'on_sale_to'   => $this->qualifiedDate($product->get_date_on_sale_to()),
            'hs_code'      => $product->get_meta('kizlo_hs_code'),
        ], kizlo_apply_extend_filter('product_list_item', $product), [
            'custom' => (object) $this->customFields($product),
        ]);
    }

    /** @return array<string, mixed> */
    private function customFields(WC_Product $product): array
    {
        $definitions = PostTypeSettings::load('product')->getCustomFields();

        return CustomFieldsStore::read(CustomFieldsStore::META_POST, $product->get_id(), $definitions);
    }

    private function qualifiedDate(?\WC_DateTime $date): ?string
    {
        $value = wc_rest_prepare_date_response($date);

        return $value === null ? null : $value . 'Z';
    }

    public function injectReviewUserIdBeforeInsert(int $comment_id, WP_Comment $comment): int
    {
        if ($comment->comment_type !== 'review') return $comment_id;

        if (!empty($comment->user_id)) return $comment_id;

        $email = $comment->comment_author_email;

        if (!$email) return $comment_id;

        $user = get_user_by('email', $email);

        if (!$user) return $comment_id;

        wp_update_comment(['comment_ID' => $comment_id, 'user_id'    => $user->ID]);

        return $comment_id;
    }

    private function _getAttributeByTaxonomy(string $taxonomy): ?object
    {
        /** @var array<string, object|null> $cache */
        static $cache = [];

        if (isset($cache[$taxonomy])) {
            return $cache[$taxonomy];
        }

        $slug = str_replace('pa_', '', $taxonomy);

        foreach (wc_get_attribute_taxonomies() as $attribute) {
            if ($attribute->attribute_name === $slug) {
                return $cache[$taxonomy] = $attribute;
            }
        }

        return $cache[$taxonomy] = null;
    }
}
