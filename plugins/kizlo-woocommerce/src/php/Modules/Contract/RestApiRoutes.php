<?php

namespace Kizlo\WooCommerce\Modules\Contract;

use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;
use WC_REST_Customers_Controller;
use WC_REST_Products_Controller;
use WP_REST_Controller;
use WP_REST_Server;

/**
 * The `wc/v3` product and customer contracts.
 *
 * Both are described whole rather than at the two operations Kizlo happens to
 * call today. The derivation costs the same either way, since every operation
 * comes off the same controller, and a contract that stops at what one caller
 * needs is the shape of a gap someone fills with a raw call the next time they
 * need a write.
 *
 * `get_item_schema()` decides the response, `get_collection_params()` the list,
 * and `get_endpoint_args_for_item_schema()` the two writes, so none of the three
 * is written out here. What is written out is what no controller exposes: the
 * error codes, read off WooCommerce's handlers, and the delete arguments, which
 * WooCommerce declares inline in `register_routes()` rather than in a schema.
 *
 * ## The context is `view`, and it is absent rather than pinned
 *
 * The same argument {@see \Kizlo\Modules\Introspection\CoreResource} makes.
 * Kizlo authenticates as an administrator, so `edit` is available to it, and a
 * described route still has nothing to pin the parameter with: no callback, no
 * argument translation, nothing between the caller and WooCommerce. So `context`
 * is left out of the declared input and the response is described in the context
 * WooCommerce falls back to.
 *
 * It costs nothing on these two. `edit` adds `permalink_template` and
 * `generated_slug` to a product and `password` to a customer, and Kizlo reads
 * none of the three.
 */
final class RestApiRoutes
{
    private const NAMESPACE = 'wc/v3';

    /** @see \Kizlo\Modules\Introspection\CoreResource::CONTEXT */
    private const CONTEXT = 'view';

    public const PRODUCTS_API_ID  = 'woocommerce.products';
    public const CUSTOMERS_API_ID = 'woocommerce.customers';

    public static function register(): void
    {
        foreach (self::resources() as $resource) {
            foreach (self::declarations($resource) as $declaration) {
                kizlo_register_spec_route($declaration);
            }
        }
    }

    public static function registerSchemas(): void
    {
        foreach (self::resources() as $resource) {
            $properties = self::response($resource['controller'], $resource['schema']);

            // Added to the product by `woocommerce_rest_prepare_product_object`, a
            // response filter, so no schema WooCommerce publishes mentions it.
            if ($resource['schema'] === WooCommerceSchemas::PRODUCT) {
                $properties['kizlo'] = KizloBlocks::restProduct();
            }

            kizlo_register_spec_schema($resource['schema'], [
                'type'        => 'object',
                'description' => $resource['description'],
                'properties'  => $properties,
            ]);
        }
    }

    // ============================================================
    // RESOURCES
    // ============================================================

    /**
     * The two resources, and everything about them a controller cannot answer.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function resources(): array
    {
        $resources = [];
        $product   = self::controller(WC_REST_Products_Controller::class);

        if ($product !== null) {
            $resources[] = [
                'controller'  => $product,
                'id'          => self::PRODUCTS_API_ID,
                'base'        => '/products',
                'schema'      => WooCommerceSchemas::PRODUCT,
                'noun'        => 'product',
                'plural'      => 'products',
                'description' => 'A WooCommerce product as the REST v3 API prepares it, plus the fields Kizlo adds.',
                'notes'       => [
                    'list'     => 'Kizlo reaches for this to resolve a product by slug, which the Store API has no route for. `slug` is one filter among the rest.',
                    'retrieve' => 'Unlike the Store API, this returns a product whatever its status, which is what makes it the route a preview reads.',
                ],
                // Products are trashable, so `force` is the caller's choice and a
                // delete without it moves the product to the trash.
                'force'       => ['type' => 'boolean', 'default' => false, 'description' => 'Bypass the trash and delete permanently.'],
                'extra'       => [],
                'errors'      => [
                    'list'     => ['woocommerce_rest_cannot_view'],
                    'retrieve' => ['woocommerce_rest_cannot_view', 'woocommerce_rest_product_invalid_id'],
                    'create'   => ['woocommerce_rest_cannot_create', 'woocommerce_rest_invalid_product_id', 'woocommerce_rest_product_exists'],
                    'update'   => ['woocommerce_rest_cannot_edit', 'woocommerce_rest_invalid_product_id', 'woocommerce_rest_product_invalid_id'],
                    'delete'   => [
                        'woocommerce_rest_already_trashed',
                        'woocommerce_rest_cannot_delete',
                        'woocommerce_rest_invalid_product_id',
                        'woocommerce_rest_product_invalid_id',
                        'woocommerce_rest_trash_not_supported',
                        'woocommerce_rest_user_cannot_delete_product',
                    ],
                ],
            ];
        }

        $customer = self::controller(WC_REST_Customers_Controller::class);

        if ($customer !== null) {
            $resources[] = [
                'controller'  => $customer,
                'id'          => self::CUSTOMERS_API_ID,
                'base'        => '/customers',
                'schema'      => WooCommerceSchemas::CUSTOMER,
                'noun'        => 'customer',
                'plural'      => 'customers',
                'description' => 'A WooCommerce customer as the REST v3 API prepares it.',
                'notes'       => [],
                // A customer is a user, and users are not trashable, so WooCommerce
                // answers 501 for a delete that does not ask for it.
                'force'       => ['type' => 'boolean', 'default' => false, 'description' => 'Required. Customers do not support trashing, so a delete without this answers 501.'],
                'extra'       => [
                    'delete' => [
                        'reassign' => [
                            'type'        => 'integer',
                            'default'     => 0,
                            'description' => 'Customer to reassign this one\'s posts to. Zero leaves them unassigned.',
                        ],
                    ],
                ],
                'errors'      => [
                    'list'     => ['woocommerce_rest_cannot_view'],
                    'retrieve' => ['wc_user_invalid_id', 'woocommerce_rest_cannot_view'],
                    'create'   => ['woocommerce_rest_cannot_create', 'woocommerce_rest_customer_exists'],
                    'update'   => [
                        'wc_user_invalid_id',
                        'woocommerce_rest_cannot_edit',
                        'woocommerce_rest_customer_invalid_argument',
                        'woocommerce_rest_customer_invalid_email',
                        'woocommerce_rest_invalid_id',
                    ],
                    'delete'   => [
                        'wc_user_invalid_id',
                        'woocommerce_rest_cannot_delete',
                        'woocommerce_rest_customer_invalid_reassign',
                        'woocommerce_rest_trash_not_supported',
                    ],
                ],
            ];
        }

        return $resources;
    }

    // ============================================================
    // OPERATIONS
    // ============================================================

    /**
     * @param array<string, mixed> $resource
     * @return array<int, array<string, mixed>>
     */
    private static function declarations(array $resource): array
    {
        return [
            self::list($resource),
            self::retrieve($resource),
            self::create($resource),
            self::update($resource),
            self::delete($resource),
        ];
    }

    /**
     * @param array<string, mixed> $resource
     * @return array<string, mixed>
     */
    private static function list(array $resource): array
    {
        return self::declaration($resource, 'list', 'GET', $resource['base'], sprintf('List %s', $resource['plural']), [
            'type'       => 'object',
            'properties' => kizlo_translate_spec_properties(
                self::params($resource['controller']),
                self::subject((string) $resource['base']),
            ),
        ], [
            '200' => [
                'description' => sprintf('A page of %s.', $resource['plural']),
                'headers'     => self::paginationHeaders($resource['plural']),
                'body'        => ['type' => 'array', 'items' => ['$ref' => $resource['schema']]],
            ],
        ]);
    }

    /**
     * @param array<string, mixed> $resource
     * @return array<string, mixed>
     */
    private static function retrieve(array $resource): array
    {
        return self::declaration($resource, 'retrieve', 'GET', self::single($resource), sprintf('Retrieve a single %s', $resource['noun']), [
            'type'       => 'object',
            'properties' => ['id' => self::identifier($resource)],
        ], self::item($resource, '200', sprintf('The %s.', $resource['noun'])));
    }

    /**
     * @param array<string, mixed> $resource
     * @return array<string, mixed>
     */
    private static function create(array $resource): array
    {
        return self::declaration($resource, 'create', 'POST', $resource['base'], sprintf('Create a %s', $resource['noun']), [
            'type'         => 'object',
            'content_type' => 'application/json',
            'properties'   => self::writable($resource, WP_REST_Server::CREATABLE, 'create'),
        ], [
            '201' => ['description' => sprintf('The created %s.', $resource['noun']), 'body' => ['$ref' => $resource['schema']]],
        ]);
    }

    /**
     * @param array<string, mixed> $resource
     * @return array<string, mixed>
     */
    private static function update(array $resource): array
    {
        return self::declaration($resource, 'update', 'PUT', self::single($resource), sprintf('Update a %s', $resource['noun']), [
            'type'         => 'object',
            'content_type' => 'application/json',
            'properties'   => ['id' => self::identifier($resource)] + self::writable($resource, WP_REST_Server::EDITABLE, 'update'),
        ], self::item($resource, '200', sprintf('The updated %s.', $resource['noun'])));
    }

    /**
     * A delete answers with what it removed, which is why the response is the
     * resource rather than a deletion envelope. WooCommerce prepares the object
     * before it goes, on both of these controllers.
     *
     * @param array<string, mixed> $resource
     * @return array<string, mixed>
     */
    private static function delete(array $resource): array
    {
        /** @var array<string, array<string, mixed>> $extra */
        $extra = $resource['extra']['delete'] ?? [];

        return self::declaration($resource, 'delete', 'DELETE', self::single($resource), sprintf('Delete a %s', $resource['noun']), [
            'type'       => 'object',
            'properties' => ['id' => self::identifier($resource), 'force' => $resource['force']] + $extra,
        ], self::item($resource, '200', sprintf('The deleted %s.', $resource['noun'])));
    }

    // ============================================================
    // SHARED PIECES
    // ============================================================

    /**
     * @param array<string, mixed>    $resource
     * @param array<string, mixed>    $input
     * @param array<array-key, mixed> $responses Keyed by status, which PHP reads as an int.
     * @return array<string, mixed>
     */
    private static function declaration(
        array $resource,
        string $operation,
        string $method,
        string $route,
        string $summary,
        array $input,
        array $responses,
    ): array {
        $declaration = [
            'id'        => $resource['id'],
            'operation' => $operation,
            'namespace' => self::NAMESPACE,
            'route'     => $route,
            'method'    => $method,
            'summary'   => $summary,
            'input'     => $input,
            'errors'    => $resource['errors'][$operation] ?? [],
            'responses' => $responses,
        ];

        if (isset($resource['notes'][$operation])) {
            $declaration['description'] = $resource['notes'][$operation];
        }

        return $declaration;
    }

    /**
     * The write surface, taken from the arguments WooCommerce registers its own
     * write route with rather than from the item schema directly. The two differ:
     * `rest_get_endpoint_args_for_schema()` drops what is `readonly` and applies
     * each property's `arg_options`, which is what makes the result the shape the
     * route actually accepts.
     *
     * @param array<string, mixed> $resource
     * @return array<string, array<string, mixed>>
     */
    private static function writable(array $resource, string $method, string $operation): array
    {
        /** @var WP_REST_Controller $controller */
        $controller = $resource['controller'];

        return kizlo_translate_spec_properties(
            $controller->get_endpoint_args_for_item_schema($method),
            self::subject($operation),
        );
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function response(WP_REST_Controller $controller, string $subject): array
    {
        $schema = $controller->get_item_schema();

        return kizlo_translate_spec_properties(
            is_array($schema['properties'] ?? null) ? $schema['properties'] : [],
            $subject,
            context: self::CONTEXT,
            required: true,
        );
    }

    /**
     * The filters the list honours, minus the one that would reshape the response.
     *
     * @return array<array-key, mixed>
     */
    private static function params(WP_REST_Controller $controller): array
    {
        $params = $controller->get_collection_params();

        unset($params['context']);

        return $params;
    }

    /**
     * WooCommerce's own regex, so the declaration says what it registered rather
     * than a tidied version of it. {@see \Kizlo\Modules\Introspection\PathNormalizer}
     * collapses it to `{id}`.
     *
     * @param array<string, mixed> $resource
     */
    private static function single(array $resource): string
    {
        return sprintf('%s/(?P<id>[\d]+)', $resource['base']);
    }

    /**
     * @param array<string, mixed> $resource
     * @return array<string, mixed>
     */
    private static function identifier(array $resource): array
    {
        return [
            'type'        => 'integer',
            'required'    => true,
            'description' => sprintf('The %s ID. WooCommerce matches digits only, so a slug is not accepted here.', $resource['noun']),
        ];
    }

    /**
     * A response carrying the resource, plus the 404 every route on a single item
     * can answer with.
     *
     * @param array<string, mixed> $resource
     * @return array<array-key, mixed>
     */
    private static function item(array $resource, string $status, string $description): array
    {
        return [
            $status => ['description' => $description, 'body' => ['$ref' => $resource['schema']]],
            '404'   => ['description' => sprintf('No such %s.', $resource['noun']), 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
        ];
    }

    /** What a diagnostic names when a property cannot be expressed. */
    private static function subject(string $suffix): string
    {
        return sprintf('%s %s', self::NAMESPACE, ltrim($suffix, '/'));
    }

    /**
     * @return array<string, mixed>
     */
    private static function paginationHeaders(string $plural): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'X-WP-Total'      => ['type' => 'integer', 'required' => true, 'description' => sprintf('%s matching the query, across every page.', ucfirst($plural))],
                'X-WP-TotalPages' => ['type' => 'integer', 'required' => true, 'description' => 'Pages available at the requested page size.'],
            ],
        ];
    }

    /**
     * Null rather than a fatal when WooCommerce is not there to ask, so a site
     * without it loses these operations and not its whole document.
     *
     * @param class-string $class
     */
    private static function controller(string $class): ?WP_REST_Controller
    {
        static $memo = [];

        if (array_key_exists($class, $memo)) {
            return $memo[$class];
        }

        if (!class_exists($class)) {
            return $memo[$class] = null;
        }

        $controller = new $class();

        return $memo[$class] = $controller instanceof WP_REST_Controller ? $controller : null;
    }
}
