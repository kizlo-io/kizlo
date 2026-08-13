<?php

namespace Kizlo\WooCommerce\Modules\Product;

use WP_Error;
use WP_Comment;
use WC_Product;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\WooCommerce\Modules\Product\ProductModule;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;

class ProductController
{
    public function __construct(private ProductModule $product) {}

    public function register(): void
    {
        kizlo_register_route([
            'id'        => 'woocommerce.products',
            'operation' => 'list_mixed',
            'method'    => 'GET',
            'route'     => '/products/mixed',
            'summary'   => 'List products and variations in one call',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'items' => [
                        'type'        => 'string',
                        'required'    => true,
                        'description' => 'JSON-encoded array of { product_id?, variation_id? } objects. A string because this is a GET.',
                    ],
                ],
            ],
            'responses' => [
                '200' => [
                    'description' => 'One entry per requested item, in the order asked for.',
                    'body'        => ['type' => 'array', 'items' => ['$ref' => WooCommerceSchemas::PRODUCT]],
                ],
                '400' => ['description' => '"items" was missing, unparseable, or an entry named neither ID.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
                '404' => ['description' => 'A requested product or variation does not exist.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
            ],
            'callback'  => [$this, 'listMixedProductApiCallback'],
        ]);

        kizlo_register_route([
            'id'        => 'woocommerce.products',
            'operation' => 'preview',
            'method'    => 'GET',
            'route'     => '/products/preview',
            'summary'   => 'Retrieve an unpublished product for preview',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'slug' => [
                        'type'              => 'string',
                        'required'          => true,
                        'sanitize_callback' => 'sanitize_title',
                    ],
                    'preview_nonce' => [
                        'type'        => 'string',
                        'required'    => true,
                        'description' => 'The preview nonce WordPress issued for the draft.',
                    ],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The product.', 'body' => ['$ref' => WooCommerceSchemas::PRODUCT]],
                '404' => ['description' => 'No product has that slug.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
            ],
            'callback'  => [$this, 'getProductPreviewApiCallback'],
        ]);

        kizlo_register_route([
            'id'        => 'woocommerce.products',
            'operation' => 'review_exists',
            'method'    => 'POST',
            'route'     => '/products/reviews/exists',
            'summary'   => 'Check whether a user has reviewed a product',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'user_id' => [
                        'description'       => 'The WooCommerce user ID.',
                        'type'              => 'integer',
                        'required'          => true,
                        'sanitize_callback' => 'absint',
                        'validate_callback' => static function ($value): bool {
                            return is_numeric($value) && $value > 0;
                        },
                    ],
                    'product_id' => [
                        'description'       => 'The WooCommerce product ID.',
                        'type'              => 'integer',
                        'required'          => true,
                        'sanitize_callback' => 'absint',
                        'validate_callback' => static function ($value): bool {
                            return is_numeric($value) && $value > 0;
                        },
                    ],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'Whether an approved review exists.', 'body' => ['$ref' => WooCommerceSchemas::REVIEW_EXISTS]],
                '400' => ['description' => 'Invalid product or user ID.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
            ],
            'callback'  => [$this, 'getReviewExistApiCallback'],
        ]);

        kizlo_register_route_interceptor([
            'route' => '/wc/store/v1/products/collection-data',
            'method' => 'GET',
            'callback' => function (WP_REST_Request $request, WP_REST_Response | WP_Error $response) {
                $response->set_data($this->product->extendCollection($response->get_data()));
                return $response;
            }
        ]);

        add_filter('woocommerce_rest_prepare_product_cat', [$this, 'prepareCategoryCallback'], PHP_INT_MAX, 2);
        add_filter('woocommerce_rest_prepare_product_review', [$this, 'prepareReviewCallback'], PHP_INT_MAX, 2);
        add_filter('woocommerce_rest_prepare_product_object', [$this, 'prepareProductCallback'], PHP_INT_MAX, 3);
    }

    public function prepareProductCallback(WP_REST_Response | WP_Error $response, WC_Product $product, WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        $response->set_data($this->product->extendProduct($response->get_data(), $product));

        return $response;
    }

    public function prepareReviewCallback(WP_REST_Response | WP_Error $response, WP_Comment $comment): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        $response->set_data($this->product->extendReview($response->get_data(), $comment));

        return $response;
    }

    public function prepareCategoryCallback(WP_REST_Response | WP_Error $response, $category): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        $response->set_data($this->product->extendCategory($response->get_data(), $category));

        return $response;
    }

    public function listMixedProductApiCallback(WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        $items = $request->get_param('items');

        if (! is_string($items) || empty($items)) {
            return new WP_Error('invalid_items', 'Query param "items" is required.', ['status' => 400]);
        }

        $body = json_decode($items, true);

        if (! is_array($body) || empty($body)) {
            return new WP_Error('invalid_items', 'Query param "items" must be a valid JSON array.', ['status' => 400]);
        }

        $data = $this->product->listMixedProduct($body);

        return new WP_REST_Response($data, 200);
    }

    public function getProductPreviewApiCallback(WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        $slug  = $request->get_param('slug');
        $nonce = $request->get_param('preview_nonce');
        $data = $this->product->getProductPreview($slug, $nonce);

        return rest_ensure_response($data);
    }

    public function getReviewExistApiCallback(WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        $user_id    = (int) $request->get_param('user_id');
        $product_id = (int) $request->get_param('product_id');

        $result = $this->product->checkReviewExist($user_id, $product_id);

        if (is_wp_error($result)) return $result;

        return new WP_REST_Response(['exists' => $result]);
    }
}
