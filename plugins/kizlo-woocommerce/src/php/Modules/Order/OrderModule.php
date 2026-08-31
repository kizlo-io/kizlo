<?php

namespace Kizlo\WooCommerce\Modules\Order;

use Automattic\WooCommerce\Enums\OrderItemType;
use Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema;
use Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Support\Utils;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\WooCommerce\Modules\Order\OrderRepository;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;
use WC_Order;
use WC_Order_Item;
use WC_Order_Item_Product;
use WC_Product;
use WP_Error;
use WP_Post;

class OrderModule
{
    private const PRODUCT_ID_META = '_kizlo_product_id';

    private const VARIATION_ID_META = '_kizlo_variation_id';

    private OrderRepository $order;

    public function __construct()
    {
        $this->order = new OrderRepository();
    }

    public function register(): void
    {
        add_filter('woocommerce_rest_prepare_shop_order_object', [$this, 'prepareOrderCallback'], PHP_INT_MAX, 2);
        add_filter('rest_post_dispatch', [$this, 'extendStoreOrderItems'], 10, 3);
        add_action('woocommerce_new_order_item', [$this, 'rememberOrderItemProductIds'], 10, 2);

        kizlo_register_route([
            'id'        => 'woocommerce.kizlo.orders',
            'operation' => 'manage_stock',
            'method'    => 'POST',
            'route'     => '/orders/(?P<order_id>\d+)/stock',
            'summary'   => 'Reduce or increase the stock an order holds',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'order_id' => [
                        'description'       => 'The WooCommerce order ID.',
                        'type'              => 'integer',
                        'required'          => true,
                        'sanitize_callback' => 'absint',
                        'validate_callback' => static function ($value): bool {
                            return is_numeric($value) && $value > 0;
                        },
                    ],
                    'action' => [
                        'description'       => 'The stock action to perform.',
                        'type'              => 'string',
                        'required'          => true,
                        'enum'              => ['reduce', 'increase'],
                        'sanitize_callback' => 'sanitize_text_field',
                        'validate_callback' => static function ($value): bool {
                            return in_array($value, ['reduce', 'increase'], true);
                        },
                    ],
                ],
            ],
            'errors'    => [
                'kizlo_order_not_found',
                'kizlo_stock_already_reduced',
            ],
            'responses' => [
                '200' => ['description' => 'The stock was adjusted.', 'body' => ['$ref' => WooCommerceSchemas::STOCK_RESULT]],
                '404' => ['description' => 'Order not found.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
                '409' => ['description' => 'Stock was already reduced for this order.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
            ],
            'callback'  => [$this, 'manageStockApiCallback'],
        ]);
    }

    /**
     * Preserve product references before WooCommerce clears them on deletion.
     */
    public function rememberOrderItemProductIds(int $item_id, WC_Order_Item $item): void
    {
        if (! $item instanceof WC_Order_Item_Product) return;

        $item->add_meta_data(self::PRODUCT_ID_META, (string) $item->get_product_id(), true);
        $item->add_meta_data(self::VARIATION_ID_META, (string) $item->get_variation_id(), true);
        $item->save_meta_data();
    }

    public function prepareOrderCallback(WP_REST_Response | WP_Error $response, WC_Order $order): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        $response->set_data($this->order->extendOrder($response->get_data(), $order));

        return $response;
    }

    public function manageStockApiCallback(WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        $order_id = (int) $request->get_param('order_id');
        $action   = $request->get_param('action');

        $data = $this->order->manageStock($order_id, $action);

        return rest_ensure_response($data);
    }

    /**
     * Add the extensions OrderItemSchema declares but does not emit at runtime.
     *
     * ProductSchema is the extension identifier inherited by ItemSchema in
     * WooCommerce 11.0.1. Calling that same extension registry preserves every
     * third-party namespace already available on Store API products. Kizlo's
     * namespace is replaced with the order-specific identity block below.
     */
    public function extendStoreOrderItems(mixed $response, mixed $server, mixed $request): mixed
    {
        if (! $response instanceof WP_REST_Response || ! $request instanceof WP_REST_Request) return $response;
        if ($response->get_status() >= 400) return $response;

        if (! preg_match('#^/wc/store/v1/order/(?P<id>\d+)$#', $request->get_route(), $match)) {
            return $response;
        }

        $order = wc_get_order((int) $match['id']);
        $data  = $response->get_data();

        if (! $order instanceof WC_Order || ! is_array($data) || ! is_array($data['items'] ?? null)) {
            return $response;
        }

        $items = $order->get_items(OrderItemType::LINE_ITEM);

        foreach ($data['items'] as &$item) {
            if (! is_array($item)) continue;

            $order_item = $items[(int) ($item['id'] ?? 0)] ?? null;
            if (! $order_item instanceof WC_Order_Item_Product) continue;

            $item['extensions'] = $this->orderItemExtensions($order_item);
        }
        unset($item);

        $response->set_data($data);

        return $response;
    }

    /** @return array<string, mixed> */
    private function orderItemExtensions(WC_Order_Item_Product $order_item): array
    {
        $product      = $order_item->get_product();
        $product_id   = (int) ($order_item->get_meta(self::PRODUCT_ID_META, true) ?: $order_item->get_product_id());
        $variation_id = (int) ($order_item->get_meta(self::VARIATION_ID_META, true) ?: $order_item->get_variation_id());
        $base_product = wc_get_product($product_id);
        $extensions   = [];

        if ($product instanceof WC_Product) {
            $extend = StoreApi::container()->get(ExtendSchema::class);
            $extensions = (array) $extend->get_endpoint_data(ProductSchema::IDENTIFIER, [$product]);
        }

        $settings = PostTypeSettings::load('product');
        $post     = $base_product instanceof WC_Product ? get_post($base_product->get_id()) : null;

        $extensions['kizlo'] = [
            'product_id'     => $product_id,
            'variation_id'   => $variation_id,
            'product_exists' => $product instanceof WC_Product,
            'slug'           => $base_product instanceof WC_Product ? $base_product->get_slug() : '',
            'url'            => $post instanceof WP_Post
                ? Utils::getSettings()->resolvePostUrl($post, $settings)
                : null,
            'custom'         => (object) CustomFieldsStore::read(
                CustomFieldsStore::META_POST,
                $product_id,
                $settings->getCustomFields(),
            ),
        ];

        return $extensions;
    }
}
