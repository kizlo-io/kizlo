<?php

namespace Kizlo\WooCommerce\Modules\Product;

use WP_Error;
use WP_Comment;
use WC_Product;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\WooCommerce\Modules\Product\ProductModule;

class ProductController
{
    public function __construct(private ProductModule $product) {}

    public function register(): void
    {
        kizlo_register_route_interceptor([
            'route' => '/wc/store/v1/products/collection-data',
            'method' => 'GET',
            'callback' => function (WP_REST_Request $request, WP_REST_Response | WP_Error $response) {
                $response->set_data($this->product->extendCollection($response->get_data()));
                return $response;
            }
        ]);

        kizlo_register_route_interceptor([
            'route'  => '/wc/store/v1/products/:identifier',
            'method' => 'GET',
            'callback' => [$this, 'prepareStoreProductCallback'],
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

    public function prepareStoreProductCallback(WP_REST_Request $request, WP_REST_Response $response): WP_REST_Response
    {
        if ($request->get_param('context') === 'embed') return $response;

        $data = $response->get_data();
        if (! is_array($data) || ! isset($data['id'])) return $response;

        $product = wc_get_product((int) $data['id']);
        if (! $product instanceof WC_Product) return $response;

        $response->set_data($this->product->extendStoreProductDetail($data, $product));

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
}
