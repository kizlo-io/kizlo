<?php

namespace Kizlo\WooCommerce\Modules\Product;

use WP_Term;
use WP_Error;
use WP_Comment;
use WC_Product;
use WP_REST_Request;
use WC_Product_Attribute;
use WC_Product_Variation;
use WC_REST_Products_Controller;
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
        ], kizlo_apply_extend_filter('product', $product));

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
        $featured_image = wp_get_attachment_image_src($featured_image_id, 'full');

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
                'featured_image' => $featured_image[0] ? [
                    'id'  => $featured_image_id,
                    'src' => $featured_image[0],
                    'alt' => get_post_meta($featured_image_id, '_wp_attachment_image_alt', true) ?: '',
                ] : null,
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
         * with term data and thumbnail. Thumbnail is stored as term meta under
         * 'thumbnail_id' — a WooCommerce convention for product_cat.
         * Other taxonomies will naturally return null for thumbnail.
         */
        $enrich_taxonomy = function ($item) {
            $item = (array) $item;
            $term = get_term($item['term']);

            if (is_wp_error($term) || ! $term) {
                return null;
            }

            $thumbnail_id  = get_term_meta($term->term_id, 'thumbnail_id', true);
            $thumbnail_url = $thumbnail_id ? wp_get_attachment_image_url($thumbnail_id, 'full') : null;

            return [
                'id'          => $term->term_id,
                'name'        => $term->name,
                'slug'        => $term->slug,
                'taxonomy'    => $term->taxonomy,
                'description' => $term->description,
                'parent'      => $term->parent,
                'count'       => $item['count'],
                'thumbnail'   => $thumbnail_url,
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
            'data_callback'   => function (WC_Product $product) {
                return array_merge([
                    'stock' => $product->get_stock_quantity(),
                    'on_sale_from' => wc_rest_prepare_date_response($product->get_date_on_sale_from(), false),
                    'on_sale_to' => wc_rest_prepare_date_response($product->get_date_on_sale_to(), false),
                    'hs_code'   => $product->get_meta('kizlo_hs_code')
                ], kizlo_apply_extend_filter('product_list_item', $product));
            },
            'schema_type'     => ARRAY_A,
        ]);
    }

    public function listMixedProduct(array $items): WP_Error | array
    {
        $results = [];

        foreach ($items as $index => $item) {
            $product_id   = isset($item['product_id']) ? (int) $item['product_id'] : null;
            $variation_id = isset($item['variation_id']) ? (int) $item['variation_id'] : null;

            if (! $product_id && ! $variation_id) {
                return new WP_Error('invalid_item', sprintf('Item at index %d must have at least "product_id" or "variation_id".', $index), ['status' => 400]);
            }

            if ($variation_id) {
                $product = wc_get_product($variation_id);
                if (! $product instanceof WC_Product_Variation) {
                    return new WP_Error('variation_not_found', sprintf('Variation %d not found.', $variation_id), ['status' => 404]);
                }
            } else {
                $product = wc_get_product($product_id);
                if (! $product instanceof WC_Product) {
                    return new WP_Error('product_not_found', sprintf('Product %d not found.', $product_id), ['status' => 404]);
                }
            }

            $results[] = $product->get_data();
        }

        return $results;
    }

    public function getProductPreview(string $slug, string $nonce)
    {
        $post = get_page_by_path($slug, OBJECT, 'product');

        if (!$post) {
            return new WP_Error('not_found', 'Product not found.', ['status' => 404]);
        }

        return $this->getProductById($post->ID);
    }

    public function getProductById(int $id)
    {
        $new_request = new WP_REST_Request('GET', '/wc/v3/products/' . $id);
        $new_request->set_param('id', $id);
        $new_request->set_param('context', 'edit');

        $controller = new WC_REST_Products_Controller();
        $response = $controller->get_item($new_request);

        if (is_wp_error($response)) return $response;

        return $response->get_data();
    }

    public function checkReviewExist(int $user_id, int $product_id): WP_Error | bool
    {
        if (!$product_id || !$user_id) {
            return new WP_Error('invalid_params', 'Invalid product or user ID', ['status' => 400]);
        }

        $comments = get_comments([
            'post_id' => $product_id,
            'user_id' => $user_id,
            'type'    => 'review',
            'status'  => 'approve',
            'number'  => 1,
        ]);

        return !empty($comments);
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
