<?php

namespace Kizlo\WooCommerce\Modules\Order;

use Automattic\WooCommerce\Enums\OrderItemType;
use Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema;
use Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema;
use Automattic\WooCommerce\StoreApi\Schemas\V1\OrderSchema;
use Automattic\WooCommerce\StoreApi\SchemaController;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Support\Utils;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\WooCommerce\Modules\Order\OrderRepository;
use Kizlo\WooCommerce\Modules\Product\HsCode;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Support\StoreExtensions;
use WC_Order;
use Kizlo\WooCommerce\Modules\Contract\AdditionalFields;
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
            'operation' => 'list',
            'method'    => 'GET',
            'route'     => '/woocommerce/orders',
            'summary'   => 'The authenticated customer’s order history',
            'input'     => [
                'type' => 'object',
                'properties' => [
                    'page' => ['type' => 'integer', 'minimum' => 1, 'default' => 1],
                    'per_page' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 10],
                ],
            ],
            'errors'    => ['kizlo_order_history_forbidden', 'kizlo_invalid_identity', 'kizlo_conflicting_identity', 'kizlo_forbidden_identity', 'kizlo_customer_unavailable'],
            'responses' => [
                '200' => [
                    'description' => 'A page of the customer’s orders, newest first.',
                    'body' => ['type' => 'array', 'items' => ['$ref' => WooCommerceSchemas::STORE_ORDER]],
                    'headers' => [
                        'type' => 'object',
                        'properties' => [
                            'X-WP-Total' => ['type' => 'integer', 'required' => true],
                            'X-WP-TotalPages' => ['type' => 'integer', 'required' => true],
                        ],
                    ],
                ],
                '403' => ['description' => 'Customer authentication is required.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
            ],
            'callback' => [$this, 'listOrders'],
        ]);

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

    /** Preserve product identity and customs data as order-time snapshots. */
    public function rememberOrderItemProductIds(int $item_id, WC_Order_Item $item): void
    {
        if (! $item instanceof WC_Order_Item_Product) return;

        $item->add_meta_data(self::PRODUCT_ID_META, (string) $item->get_product_id(), true);
        $item->add_meta_data(self::VARIATION_ID_META, (string) $item->get_variation_id(), true);

        $base_product = wc_get_product($item->get_product_id());
        $hs_code      = $base_product instanceof WC_Product ? HsCode::forProduct($base_product) : null;

        if ($hs_code !== null) {
            $item->add_meta_data(HsCode::ORDER_ITEM_META, $hs_code, true);
        }

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

    public function listOrders(WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        $identity = SessionHandler::resolveIdentity($request, false);
        if ($identity instanceof WP_Error) return $identity;
        $customerId = $identity['user_id'];
        if ($customerId === null) {
            return new WP_Error('kizlo_order_history_forbidden', 'Customer authentication is required.', ['status' => 403]);
        }

        SessionHandler::setCurrentUser($customerId);
        WC()->customer = new \WC_Customer($customerId);

        $query = [
            'customer_id' => $customerId,
            'type' => 'shop_order',
            'status' => array_values(array_diff(array_keys(wc_get_order_statuses()), ['wc-checkout-draft', 'wc-trash'])),
            'page' => (int) $request->get_param('page'),
            'limit' => (int) $request->get_param('per_page'),
            'paginate' => true,
            'orderby' => ['date' => 'DESC', 'ID' => 'DESC'],
        ];
        $result = wc_get_orders($query);
        // The post-based order store loses its total count when the requested page is empty.
        if ($result->orders === [] && $query['page'] > 1) {
            $firstPage = wc_get_orders([...$query, 'page' => 1, 'limit' => 1]);
            $result->total = $firstPage->total;
            $result->max_num_pages = (int) ceil($result->total / $query['limit']);
        }
        /** @var OrderSchema $schema */
        $schema = StoreApi::container()->get(SchemaController::class)->get(OrderSchema::IDENTIFIER);
        $items = [];
        foreach ($result->orders as $order) {
            if (! $order instanceof WC_Order || $order->get_customer_id() !== $customerId) {
                return new WP_Error('kizlo_order_history_forbidden', 'You are not allowed to view these orders.', ['status' => 403]);
            }
            $items[] = $this->extendStoreOrder($schema->get_item_response($order), $order);
        }

        return new WP_REST_Response($items, 200, [
            'X-WP-Total' => (int) $result->total,
            'X-WP-TotalPages' => (int) $result->max_num_pages,
            'Cache-Control' => 'private, no-store',
        ]);
    }

    /**
     * Add the extensions OrderItemSchema declares but does not emit at runtime,
     * and the order-level `extensions` OrderSchema does not have at all.
     *
     * ProductSchema is the extension identifier inherited by ItemSchema in
     * WooCommerce 11.0.1. Calling that same extension registry preserves every
     * third-party namespace already available on Store API products. Kizlo's
     * namespace is replaced with the order-specific identity block below.
     *
     * The order itself has no extension point to call: OrderSchema never invokes
     * `get_extended_data()`, and `order` is absent from `ExtendSchema`'s list of
     * extendable endpoints, so nothing can be registered against it. The
     * `extensions` key is therefore created here, by {@see StoreExtensions::merge}.
     */
    public function extendStoreOrderItems(mixed $response, mixed $server, mixed $request): mixed
    {
        if (! $response instanceof WP_REST_Response || ! $request instanceof WP_REST_Request) return $response;
        if ($request->get_route() === '/kizlo/v1/woocommerce/orders') {
            $response->header('Cache-Control', 'private, no-store');
            return $response;
        }
        if ($response->get_status() >= 400) return $response;

        if (! preg_match('#^/wc/store/v1/order/(?P<id>\d+)$#', $request->get_route(), $match)) {
            return $response;
        }

        $order = wc_get_order((int) $match['id']);
        $data  = $response->get_data();

        if (! $order instanceof WC_Order || ! is_array($data)) {
            return $response;
        }

        $response->set_data($this->extendStoreOrder($data, $order));

        return $response;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function extendStoreOrder(array $data, WC_Order $order): array
    {
        $createdAt = $order->get_date_created();
        $data['additional_fields'] = (object) AdditionalFields::values($order, 'other');
        $data['extensions'] = StoreExtensions::merge($data['extensions'] ?? null, 'kizlo', [
            'is_paid' => $order->is_paid(),
            'number' => $order->get_order_number(),
            'date_created_gmt' => $createdAt === null ? null : gmdate('Y-m-d\TH:i:s', $createdAt->getTimestamp()),
        ]);

        if (is_array($data['items'] ?? null)) {
            $items = $order->get_items(OrderItemType::LINE_ITEM);

            foreach ($data['items'] as &$item) {
                if (! is_array($item)) continue;

                $order_item = $items[(int) ($item['id'] ?? 0)] ?? null;
                if (! $order_item instanceof WC_Order_Item_Product) continue;

                $item['extensions'] = $this->orderItemExtensions($order_item);
            }
            unset($item);
        }

        return $data;
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
            'hs_code'        => HsCode::forOrderItem($order_item),
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
