<?php

namespace Kizlo\WooCommerce\Modules\Contract;

use Automattic\WooCommerce\StoreApi\Routes\V1\AbstractRoute;
use Automattic\WooCommerce\StoreApi\RoutesController;
use Automattic\WooCommerce\StoreApi\SchemaController;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;
use Throwable;

/**
 * The `wc/store/v1` operations this plugin's clients consume.
 *
 * Fourteen of them, and not one shape is written out here. WooCommerce registers
 * these routes from `AbstractRoute::get_args()` and builds their responses from
 * the schema classes behind `SchemaController`, so both halves are already
 * described in PHP by the plugin that serves them. This class asks those objects
 * the same questions `register_rest_route()` asks and hands the answers to
 * `kizlo_register_route_spec()`.
 *
 * The alternative was copying WooCommerce's field lists into Kizlo, which is
 * roughly two thousand lines that would go quietly wrong on a WooCommerce
 * release. The contract exists to stop exactly that, so it cannot be built that
 * way.
 *
 * ## What is not derived
 *
 * Error codes. WooCommerce throws `RouteException` from inside its handlers, so
 * nothing machine-readable lists what a route can fail with and no derivation can
 * find them. They are named per operation below, read off the route classes, the
 * same way {@see \Kizlo\Modules\Appearance\MenuRoutes} names core's.
 *
 * The status a success answers with. WordPress has nowhere to declare one:
 * `WP_REST_Server::get_data_for_route()` publishes methods, args and the item
 * schema, and no responses at all, so a route's status exists only as a
 * `set_status()` call inside the handler body. Core makes twelve of them and
 * WooCommerce one, and none is reachable without running the route. They are
 * named per operation below and pinned by the integration tests instead.
 *
 * Which arguments a mutation cannot run without. WooCommerce writes
 * `'required' => true` on some of them, `rate_id` on the shipping rate route among
 * them, and leaves it off arguments whose handlers read them unconditionally all
 * the same. Deriving that literally publishes an operation weaker than the handler
 * behind it, so the cart mutations name theirs per operation below.
 *
 * Two of these operations return a field WooCommerce does not describe, because
 * this plugin adds it with a response filter that has no schema half. Those are
 * merged in from {@see KizloBlocks}, which says so at each call.
 *
 * ## The session headers are not input
 *
 * Every cart and checkout operation is keyed to a cart by `X-Kizlo-Guest-Token`
 * or `X-Kizlo-User-Id`, which {@see \Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler}
 * reads off the request. Headers are not parameters and do not belong in `input`:
 * a generated client passes them through the per-call options instead, which is
 * where the extension's session middleware already puts them.
 */
final class StoreApiRoutes
{
    private const NAMESPACE = 'wc/store/v1';

    public const PRODUCTS_API_ID = 'woocommerce.store.products';
    public const CART_API_ID     = 'woocommerce.store.cart';
    public const CHECKOUT_API_ID = 'woocommerce.store.checkout';

    /**
     * Errors any cart or checkout route can answer with before its own handler runs.
     *
     * `AbstractCartRoute::get_response()` checks the nonce and loads the cart
     * around every one of them, so these four are reachable from all of them.
     * Listed per operation rather than pooled into one shared code, because a
     * caller switching on `error.code` wants one union per call and no bucket of
     * codes that may or may not apply.
     *
     * @var array<int, string>
     */
    private const CART_ROUTE = [
        'woocommerce_rest_cart_error',
        'woocommerce_rest_invalid_nonce',
        'woocommerce_rest_missing_nonce',
        'woocommerce_rest_unknown_server_error',
    ];

    /**
     * Arguments cart handlers require even though WooCommerce marks them optional.
     *
     * Kept as a named map so the PHPUnit suite can compare every overlay entry
     * against the route object WooCommerce currently registers. That comparison
     * is the alarm for an upstream rename.
     *
     * @var array<string, array<int, string>>
     */
    private const REQUIRED_ARGUMENTS = [
        'cart-add-item'      => ['id'],
        'cart-update-item'   => ['key', 'quantity'],
        'cart-remove-item'   => ['key'],
        'cart-apply-coupon'  => ['code'],
        'cart-remove-coupon' => ['code'],
    ];

    public static function register(): void
    {
        for ($index = 0; $index < 14; $index++) {
            kizlo_register_route_spec(
                static fn(): array => self::routeSpec($index),
            );
        }
    }

    /**
     * The response schemas, registered under IDs the operations below reference.
     */
    public static function registerSchemas(): void
    {
        foreach (
            [
                WooCommerceSchemas::STORE_CART,
                WooCommerceSchemas::STORE_CHECKOUT,
                WooCommerceSchemas::STORE_CHECKOUT_ORDER,
                WooCommerceSchemas::STORE_PRODUCT,
                WooCommerceSchemas::STORE_PRODUCT_COLLECTION_DATA,
            ] as $id
        ) {
            kizlo_register_route_schema(
                $id,
                static fn(): array => self::routeSchema($id),
            );
        }
    }

    /** @return array<string, mixed> */
    private static function routeSpec(int $index): array
    {
        static $specs = null;

        if ($specs === null) {
            $routes = self::routes();

            if ($routes === null) {
                throw new \RuntimeException('The WooCommerce Store API routes controller is unavailable.');
            }

            $specs = self::declarations($routes);
        }

        return $specs[$index]
            ?? throw new \RuntimeException(sprintf('WooCommerce Store API route %d is unavailable.', $index));
    }

    /** @return array<string, mixed> */
    private static function routeSchema(string $id): array
    {
        static $derived = null;

        if ($derived === null) {
            $schemas = self::schemas();

            if ($schemas === null) {
                throw new \RuntimeException('The WooCommerce Store API schema controller is unavailable.');
            }

            $derived = [];

            foreach (
                [
                    WooCommerceSchemas::STORE_CART                    => 'cart',
                    WooCommerceSchemas::STORE_CHECKOUT                => 'checkout',
                    WooCommerceSchemas::STORE_CHECKOUT_ORDER          => 'checkout-order',
                    WooCommerceSchemas::STORE_PRODUCT                 => 'product',
                    WooCommerceSchemas::STORE_PRODUCT_COLLECTION_DATA => 'product-collection-data',
                ] as $schemaId => $identifier
            ) {
                $properties = self::properties($schemas, $identifier, $schemaId);

                if ($properties === null) {
                    continue;
                }

                // Collection data carries a `kizlo` block added by a route
                // interceptor, which is a response filter and has no schema half for
                // the derivation to find.
                if ($identifier === 'product-collection-data') {
                    $properties['kizlo'] = KizloBlocks::collectionData();
                }

                // Both checkout responses carry the whole cart, and `get_properties()`
                // does not mention it: `CheckoutSchema` writes `__experimentalCart`
                // in `get_item_response()` and `get_draft_response()` only. Null on
                // the order response when the order has no cart behind it.
                if ($identifier === 'checkout' || $identifier === 'checkout-order') {
                    $properties['__experimentalCart'] = [
                        '$ref'        => WooCommerceSchemas::STORE_CART,
                        'required'    => true,
                        'nullable'    => true,
                        'description' => 'The cart the checkout was built from. Returned but undeclared by WooCommerce, so it is named here.',
                    ];
                }

                $derived[$schemaId] = [
                    'type'        => 'object',
                    'description' => sprintf('The Store API `%s` object, as WooCommerce describes it.', $identifier),
                    'properties'  => $properties,
                ];
            }
        }

        return $derived[$id]
            ?? throw new \RuntimeException(sprintf('WooCommerce Store API schema "%s" is unavailable.', $id));
    }

    // ============================================================
    // OPERATIONS
    // ============================================================

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function declarations(RoutesController $routes): array
    {
        return array_merge(
            self::products($routes),
            self::cart($routes),
            self::checkout($routes),
        );
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function products(RoutesController $routes): array
    {
        return [
            self::declaration(
                routes: $routes,
                identifier: 'products',
                api: self::PRODUCTS_API_ID,
                operation: 'list',
                method: 'GET',
                summary: 'List published products',
                errors: ['woocommerce_rest_unknown_server_error'],
                responses: [
                    '200' => [
                        'description' => 'A page of products.',
                        'headers'     => self::paginationHeaders(),
                        'body'        => ['type' => 'array', 'items' => ['$ref' => WooCommerceSchemas::STORE_PRODUCT]],
                    ],
                ],
            ),
            self::declaration(
                routes: $routes,
                identifier: 'product-collection-data',
                api: self::PRODUCTS_API_ID,
                operation: 'collection_data',
                method: 'GET',
                summary: 'Aggregate price, rating, stock and term counts for a product query',
                description: 'Takes the same filters as the product list and answers with counts across the whole matching collection rather than a page of it.',
                errors: ['woocommerce_rest_unknown_server_error'],
                responses: [
                    '200' => [
                        'description' => 'Counts across the filtered collection.',
                        'body'        => ['$ref' => WooCommerceSchemas::STORE_PRODUCT_COLLECTION_DATA],
                    ],
                ],
            ),
        ];
    }

    /**
     * Eight operations, one body. Every cart route answers with the whole cart
     * rather than the piece it changed, which is what makes a mutation and a read
     * interchangeable at the call site.
     *
     * The status is not shared, because `add_item` alone answers `201`:
     * `CartAddItem::get_route_post_response()` calls `set_status( 201 )` where the
     * other seven leave the `200` `WP_REST_Response` starts as. Declaring one
     * status across the loop published a discriminant a caller could narrow on and
     * get a wrong answer from, which is the whole of KIZ-106.
     *
     * {@see self::REQUIRED_ARGUMENTS} names the arguments each operation cannot
     * run without, which WooCommerce registers as optional. It is deliberately
     * shorter than the argument list: `add_item` takes a quantity and a variation
     * and needs neither, because `CartController::add_to_cart()` fills a null
     * quantity with the product's minimum and a variation is only meaningful on a
     * variable product, which is a condition no flat flag can carry.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function cart(RoutesController $routes): array
    {
        $operations = [
            ['cart', 'get', 'GET', 'Retrieve the cart', '200', []],
            ['cart-add-item', 'add_item', 'POST', 'Add an item to the cart', '201', [
                'woocommerce_rest_cart_invalid_parent_product',
                'woocommerce_rest_cart_invalid_product',
                'woocommerce_rest_cart_item_exists',
                'woocommerce_rest_invalid_variation_data',
                'woocommerce_rest_missing_attributes',
                'woocommerce_rest_missing_variation_data',
                'woocommerce_rest_product_invalid_quantity',
                'woocommerce_rest_product_not_purchasable',
                'woocommerce_rest_product_out_of_stock',
                'woocommerce_rest_product_partially_out_of_stock',
                'woocommerce_rest_variation_id_from_variation_data',
            ]],
            ['cart-update-item', 'update_item', 'POST', 'Change the quantity of a cart item', '200', [
                'woocommerce_rest_cart_invalid_key',
                'woocommerce_rest_cart_invalid_product',
                'woocommerce_rest_product_invalid_quantity',
                'woocommerce_rest_product_out_of_stock',
                'woocommerce_rest_product_partially_out_of_stock',
            ]],
            ['cart-remove-item', 'remove_item', 'POST', 'Remove an item from the cart', '200', [
                'woocommerce_rest_cart_invalid_key',
            ]],
            ['cart-apply-coupon', 'apply_coupon', 'POST', 'Apply a coupon to the cart', '200', [
                'woocommerce_rest_cart_coupon_disabled',
                'woocommerce_rest_cart_coupon_error',
            ]],
            ['cart-remove-coupon', 'remove_coupon', 'POST', 'Remove a coupon from the cart', '200', [
                'woocommerce_rest_cart_coupon_disabled',
                'woocommerce_rest_cart_coupon_error',
                'woocommerce_rest_cart_coupon_invalid_code',
            ]],
            ['cart-select-shipping-rate', 'select_shipping_rate', 'POST', 'Choose a shipping rate for a package', '200', [
                'woocommerce_rest_cart_missing_rate_id',
                'woocommerce_rest_cart_shipping_rate_not_found',
                'woocommerce_rest_shipping_disabled',
            ]],
            ['cart-update-customer', 'update_customer', 'POST', 'Set the billing and shipping addresses on the cart', '200', []],
        ];

        $declarations = [];

        foreach ($operations as [$identifier, $operation, $method, $summary, $status, $errors]) {
            $declarations[] = self::declaration(
                routes: $routes,
                identifier: $identifier,
                api: self::CART_API_ID,
                operation: $operation,
                method: $method,
                summary: $summary,
                errors: array_merge(self::CART_ROUTE, $errors),
                responses: [
                    $status => ['description' => 'The cart.', 'body' => ['$ref' => WooCommerceSchemas::STORE_CART]],
                ],
                required: self::REQUIRED_ARGUMENTS[$identifier] ?? [],
            );
        }

        return $declarations;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function checkout(RoutesController $routes): array
    {
        $checkout = ['description' => 'The checkout, with the draft order behind it.', 'body' => ['$ref' => WooCommerceSchemas::STORE_CHECKOUT]];

        return [
            self::declaration(
                routes: $routes,
                identifier: 'checkout',
                api: self::CHECKOUT_API_ID,
                operation: 'get',
                method: 'GET',
                summary: 'Retrieve the checkout',
                errors: array_merge(self::CART_ROUTE, ['woocommerce_rest_checkout_missing_order']),
                responses: ['200' => $checkout],
            ),
            self::declaration(
                routes: $routes,
                identifier: 'checkout',
                api: self::CHECKOUT_API_ID,
                operation: 'update',
                method: 'PUT',
                summary: 'Update the checkout without submitting it',
                description: 'Per-field validation failures arrive inside `data.details` under a single `rest_invalid_param`, not as the top-level error code. The cart validation errors only fire when `__experimental_calc_totals` is set.',
                errors: array_merge(self::CART_ROUTE, [
                    'woocommerce_rest_cart_coupon_error',
                    'woocommerce_rest_cart_empty',
                    'woocommerce_rest_cart_item_error',
                    'woocommerce_rest_checkout_missing_order',
                    'woocommerce_rest_checkout_payment_method_disabled',
                    'woocommerce_rest_product_not_purchasable',
                    'woocommerce_rest_product_out_of_stock',
                    'woocommerce_rest_product_partially_out_of_stock',
                ]),
                responses: ['200' => $checkout],
                extra: [
                    '__experimental_calc_totals' => [
                        'type'        => 'boolean',
                        'default'     => false,
                        'description' => 'Recalculate totals and run cart validation before answering. WooCommerce reads this with get_param() without registering it, so the derivation cannot find it and it is named here instead.',
                    ],
                ],
            ),
            self::declaration(
                routes: $routes,
                identifier: 'checkout',
                api: self::CHECKOUT_API_ID,
                operation: 'process',
                method: 'POST',
                summary: 'Submit the checkout and take payment',
                description: 'A payment gateway failure is folded into `woocommerce_rest_checkout_process_payment_error`, and account creation re-throws whatever code `wc_create_new_customer()` returned, so the real code set is wider than the one named here.',
                errors: array_merge(self::CART_ROUTE, [
                    'removed_coupons',
                    'woocommerce_rest_cart_coupon_error',
                    'woocommerce_rest_cart_empty',
                    'woocommerce_rest_cart_item_error',
                    'woocommerce_rest_checkout_custom_validation_error',
                    'woocommerce_rest_checkout_invalid_payment_result',
                    'woocommerce_rest_checkout_missing_order',
                    'woocommerce_rest_checkout_missing_payment_method',
                    'woocommerce_rest_checkout_payment_method_disabled',
                    'woocommerce_rest_checkout_process_payment_error',
                    'woocommerce_rest_coupon_reserve_failed',
                    'woocommerce_rest_guest_checkout_disabled',
                    'woocommerce_rest_invalid_address',
                    'woocommerce_rest_invalid_address_country',
                    'woocommerce_rest_invalid_email_address',
                    'woocommerce_rest_missing_email_address',
                    'woocommerce_rest_product_not_purchasable',
                    'woocommerce_rest_product_out_of_stock',
                    'woocommerce_rest_product_partially_out_of_stock',
                ]),
                responses: ['200' => $checkout],
            ),
            self::declaration(
                routes: $routes,
                identifier: 'checkout-order',
                api: self::CHECKOUT_API_ID,
                operation: 'process_order',
                method: 'POST',
                summary: 'Pay for an order that already exists',
                description: 'The retry path for an order whose first payment attempt failed. Verified by the order key rather than the cart session.',
                errors: array_merge(self::CART_ROUTE, [
                    'invalid_order_update_status',
                    'woocommerce_rest_checkout_invalid_payment_result',
                    'woocommerce_rest_checkout_missing_payment_method',
                    'woocommerce_rest_checkout_payment_method_disabled',
                    'woocommerce_rest_checkout_process_payment_error',
                    'woocommerce_rest_invalid_billing_email',
                    'woocommerce_rest_invalid_order',
                    'woocommerce_rest_invalid_user',
                ]),
                responses: [
                    '200' => ['description' => 'The paid order.', 'body' => ['$ref' => WooCommerceSchemas::STORE_CHECKOUT_ORDER]],
                ],
                extra: [
                    'id' => [
                        'type'        => 'integer',
                        'required'    => true,
                        'description' => 'The order being paid. WooCommerce matches digits only, so an order key is not accepted here.',
                    ],
                    // `OrderAuthorizationTrait::is_authorized()` reads both of these
                    // with get_param() from the permission callback, which runs
                    // before argument validation and needs nothing registered. So
                    // the derivation cannot find them, and a guest retry fails
                    // without them.
                    'key' => [
                        'type'        => 'string',
                        'description' => 'The order key, which is how a guest proves the order is theirs. Ignored for an order that belongs to the signed-in customer.',
                    ],
                    'billing_email' => [
                        'type'        => 'string',
                        'format'      => 'email',
                        'description' => 'The billing email on the order, checked alongside the key on a guest retry.',
                    ],
                ],
            ),
        ];
    }

    // ============================================================
    // DERIVATION
    // ============================================================

    /**
     * One declaration, with its input read off the route WooCommerce registered.
     *
     * @param array<int, string>                  $errors
     * @param array<array-key, mixed>             $responses Keyed by status, which PHP reads as an int.
     * @param array<string, array<string, mixed>> $extra     Properties the path carries rather than the args.
     * @param array<int, string>                  $required  Derived arguments the handler cannot run without.
     * @return array<string, mixed>
     */
    private static function declaration(
        RoutesController $routes,
        string $identifier,
        string $api,
        string $operation,
        string $method,
        string $summary,
        array $errors,
        array $responses,
        string $description = '',
        array $extra = [],
        array $required = [],
    ): array {
        $route = self::route($routes, $identifier);
        $path  = $route === null ? '' : $route->get_path();

        $input = [
            'type'       => 'object',
            'properties' => $extra + self::required($route === null ? [] : self::args($route, $method, $path), $required),
        ];

        if (in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
            $input['content_type'] = 'application/json';
        }

        $declaration = [
            'id'        => $api,
            'operation' => $operation,
            'namespace' => self::NAMESPACE,
            'route'     => $path,
            'method'    => $method,
            'summary'   => $summary,
            'input'     => $input,
            'errors'    => $errors,
            'responses' => $responses,
        ];

        if ($description !== '') {
            $declaration['description'] = $description;
        }

        return $declaration;
    }

    /**
     * The arguments WooCommerce registers this route's handler with.
     *
     * `get_args()` is a list of handlers, one per method group, exactly as
     * `register_rest_route()` takes them. The first whose `methods` covers the
     * one asked for is the handler WordPress would dispatch to, so it is the one
     * whose arguments describe the call. Order matters and is WooCommerce's:
     * `/checkout` registers a `POST` handler and a `POST, PUT, PATCH` handler,
     * and a `POST` reaches the first.
     *
     * `context` is dropped, for the reason
     * {@see \Kizlo\Modules\Introspection\CoreCollectionParams} gives about core's:
     * it is a parameter that decides the shape of a response, which the contract
     * cannot express and a generated client cannot use. The responses here are
     * described in `view`, so describing a parameter that could change that would
     * be a lie about the operation the caller just typed.
     *
     * @return array<string, array<string, mixed>>
     */
    private static function args(AbstractRoute $route, string $method, string $path): array
    {
        foreach ($route->get_args() as $key => $handler) {
            if (!is_int($key) || !is_array($handler) || !is_array($handler['args'] ?? null)) {
                continue;
            }

            if (!in_array($method, self::methods($handler['methods'] ?? ''), true)) {
                continue;
            }

            $args = $handler['args'];
            unset($args['context']);

            return kizlo_translate_spec_properties($args, sprintf('%s %s', $method, $path));
        }

        return [];
    }

    /**
     * Mark the derived arguments the handler cannot run without.
     *
     * WooCommerce registers most cart mutation arguments without `required`, then
     * reads them in the handler regardless, so a client generated from the
     * registration alone can express a call that cannot work: `remove_item()` with
     * no key reaches `woocommerce_rest_cart_invalid_key` every time. This flips the
     * flag afterwards rather than in {@see self::args()}, which stays a pure read of
     * what WooCommerce declared.
     *
     * A name with no argument behind it is left alone, because a WooCommerce release
     * that renames an argument should cost this operation its overlay and not its
     * whole declaration. The PHPUnit suite compares every name above with the live
     * WooCommerce route objects so that change cannot pass unnoticed.
     *
     * @param array<string, array<string, mixed>> $args
     * @param array<int, string>                  $names
     * @return array<string, array<string, mixed>>
     */
    private static function required(array $args, array $names): array
    {
        foreach ($names as $name) {
            if (!isset($args[$name])) {
                continue;
            }

            $args[$name]['required'] = true;
        }

        return $args;
    }

    /**
     * `register_rest_route()` takes methods as a comma-separated string, which is
     * what `WP_REST_Server::EDITABLE` is, or as a list. Both reach here.
     *
     * @return array<int, string>
     */
    private static function methods(mixed $methods): array
    {
        $names = [];

        foreach (is_array($methods) ? $methods : [$methods] as $entry) {
            if (!is_string($entry)) {
                continue;
            }

            foreach (explode(',', $entry) as $method) {
                $names[] = strtoupper(trim($method));
            }
        }

        return $names;
    }

    /**
     * @return array<string, array<string, mixed>>|null
     */
    private static function properties(SchemaController $schemas, string $identifier, string $id): ?array
    {
        try {
            $schema = $schemas->get($identifier);
        } catch (Throwable) {
            // A WooCommerce release that drops or renames a schema should cost
            // the operations that use it and nothing else, so this is reported
            // rather than thrown.
            return null;
        }

        return kizlo_translate_spec_properties(
            $schema->get_properties(),
            $id,
            context: 'view',
            required: true,
        );
    }

    /**
     * The headers `resolveList()` reads a page out of.
     *
     * @return array<string, mixed>
     */
    private static function paginationHeaders(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'X-WP-Total'      => ['type' => 'integer', 'required' => true, 'description' => 'Products matching the query, across every page.'],
                'X-WP-TotalPages' => ['type' => 'integer', 'required' => true, 'description' => 'Pages available at the requested page size.'],
            ],
        ];
    }

    // ============================================================
    // WOOCOMMERCE
    // ============================================================

    private static function route(RoutesController $routes, string $identifier): ?AbstractRoute
    {
        try {
            $route = $routes->get($identifier);
        } catch (Throwable) {
            return null;
        }

        $route->set_namespace(self::NAMESPACE);

        return $route;
    }

    private static function routes(): ?RoutesController
    {
        $resolved = self::resolve(RoutesController::class);

        return $resolved instanceof RoutesController ? $resolved : null;
    }

    private static function schemas(): ?SchemaController
    {
        $resolved = self::resolve(SchemaController::class);

        return $resolved instanceof SchemaController ? $resolved : null;
    }

    /**
     * Null rather than a fatal when the Store API is not there to ask.
     *
     * WooCommerce can be active with its blocks package absent or its container
     * not yet built, and a site in that state should lose these fourteen
     * operations from its contract, not its whole `/introspect` document.
     */
    private static function resolve(string $class): ?object
    {
        if (!class_exists(StoreApi::class)) {
            return null;
        }

        try {
            $resolved = StoreApi::container()->get($class);
        } catch (Throwable) {
            return null;
        }

        return is_object($resolved) ? $resolved : null;
    }
}
