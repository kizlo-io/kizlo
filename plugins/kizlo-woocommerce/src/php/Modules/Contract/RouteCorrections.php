<?php

namespace Kizlo\WooCommerce\Modules\Contract;

/**
 * What a WooCommerce registration says, corrected to what its handler does.
 *
 * Discovery describes a route from what `register_rest_route()` was given, which
 * is the honest reading and occasionally a weaker one than the handler behind it:
 * a batch route that registers one record and reads three lists, a mutation whose
 * status lives in its handler body, an argument registered without a type, a
 * delete that answers with nothing at all.
 *
 * None of it decides whether a route is described. A correction that finds
 * nothing to correct returns the declaration it was handed, and every correction
 * below reads its shape off WooCommerce rather than restating it.
 */
final class RouteCorrections
{
    /** The one route whose body is a bare JSON array rather than an object. */
    private const ZONE_LOCATIONS = '/locations';

    /** The suffix WooCommerce gives every batch route. */
    public const BATCH = '/batch';

    /**
     * The Store API routes whose handler sets `201`.
     *
     * Everything else answers `200`, including the cart mutations that read as
     * a create because they are a POST on a literal path. A status lives in a
     * `set_status()` call inside a handler body and nothing publishes it, so
     * these three are named here and the dispatch test is what keeps the list
     * honest.
     *
     * @var array<int, string>
     */
    private const STORE_CREATED = ['/cart/add-item', '/cart/items', '/cart/coupons'];

    /** The cart route that takes a partial address. */
    private const UPDATE_CUSTOMER = '/cart/update-customer';

    /**
     * Arguments WooCommerce registers without a type, and the type they hold.
     *
     * An argument with no `type` cannot be expressed as a schema, so derivation
     * drops it and reports the route as accepting it undescribed. Both of these
     * have an obvious type that WooCommerce simply did not write down.
     *
     * Keyed by the registered route, regex and all, because that is what
     * `rest_endpoints` is keyed by. Public so the PHPUnit suite can compare every
     * key against the route WooCommerce currently registers, which is the alarm
     * for an upstream rename.
     *
     * @var array<string, array<string, string>>
     */
    public const UNTYPED_ARGUMENTS = [
        '/wc/v3/shipping/zones/(?P<zone_id>[\\d]+)/methods' => ['method_id' => 'string'],
        '/wc/v3/marketplace/create-order'                  => ['product_id' => 'integer'],
    ];

    /**
     * Fill in a type WooCommerce left off, for `rest_endpoints`.
     *
     * Corrected at the registration rather than in the derived contract, because
     * by the time a declaration exists the argument has already been dropped and
     * reported. Completing the registration means the contract describes it, and
     * WordPress validates it, exactly as though WooCommerce had typed it.
     *
     * @param array<string, mixed> $endpoints
     * @return array<string, mixed>
     */
    public static function completeArguments(array $endpoints): array
    {
        foreach (self::UNTYPED_ARGUMENTS as $route => $arguments) {
            if (!is_array($endpoints[$route] ?? null)) {
                continue;
            }

            foreach ($endpoints[$route] as $index => $handler) {
                if (!is_array($handler) || !is_array($handler['args'] ?? null)) {
                    continue;
                }

                foreach ($arguments as $name => $type) {
                    if (isset($handler['args'][$name]) && !isset($handler['args'][$name]['type'])) {
                        $endpoints[$route][$index]['args'][$name]['type'] = $type;
                    }
                }
            }
        }

        return $endpoints;
    }

    /**
     * For `kizlo_introspection_core_route`.
     */
    public static function apply(mixed $declaration, string $namespace, string $route, string $method): mixed
    {
        if (!is_array($declaration)) {
            return $declaration;
        }

        return match ($namespace) {
            WooCommerceNamespaces::REST  => self::rest($declaration, $route),
            WooCommerceNamespaces::STORE => self::store($declaration, $route),
            default                      => $declaration,
        };
    }

    /**
     * `PUT /wc/v3/shipping/zones/{id}/locations` replaces a zone's whole
     * location list, so its body is the list itself. WooCommerce registers no
     * arguments for it at all, and a flat object schema cannot describe an array
     * body in any case, so the request is written out in the separated form.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    private static function rest(array $declaration, string $route): array
    {
        if (str_ends_with($route, self::BATCH)) {
            return self::batch($declaration, $route);
        }

        if (($declaration['operation'] ?? '') === 'delete') {
            return self::deleted($declaration);
        }

        // Matched on the operation rather than the verb. WooCommerce registers
        // the handler as `EDITABLE`, so PUT and PATCH both reach it and
        // `RouteMethods` publishes the pair as one `update` under PATCH.
        if (($declaration['operation'] ?? '') !== 'update') {
            return $declaration;
        }

        if (!str_contains($route, '/shipping/zones/') || !str_ends_with($route, self::ZONE_LOCATIONS)) {
            return $declaration;
        }

        return self::zoneLocations($declaration);
    }

    /**
     * A batch route takes and answers three lists, not one record.
     *
     * `WC_REST_Controller::batch_items()` reads `create`, `update` and `delete`
     * off the body and answers with what each one did, while the route registers
     * the item's own arguments and publishes the item's schema. Derivation reads
     * exactly that and describes a call nobody can make: one product as the body,
     * one product back.
     *
     * Neither half is restated here. WooCommerce writes the request shape down
     * once, in `get_public_batch_schema()`, which {@see RestApiSchemas} asks the
     * controller for, and the records the lists carry are the route's own derived
     * item and response.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    private static function batch(array $declaration, string $route): array
    {
        $published = RestApiSchemas::batch((string) ($declaration['id'] ?? ''));
        $status    = self::successStatus($declaration);

        if ($published === null || $status === null) {
            return $declaration;
        }

        // A capture stays where it is. `/products/{product_id}/variations/batch`
        // addresses the product in the path and batches its variations in the
        // body, and the normalizer is what separates the two.
        $properties = $declaration['input']['properties'] ?? [];
        $captures   = self::captures($route);

        // An `update` entry names the record it changes, and an id is read-only
        // on an item schema, so it is not among the arguments the route
        // registers and cannot be derived from them.
        $sent = [
            'type'                 => 'object',
            'additionalProperties' => true,
            'properties'           => array_diff_key($properties, $captures),
        ];

        $input = array_intersect_key($properties, $captures);
        foreach ($published as $name => $list) {
            // WooCommerce says itself that `delete` is a list of ids.
            $input[$name] = $name === 'delete' ? $list : ['items' => $sent] + $list;
        }

        $declaration['input'] = [
            'type'         => 'object',
            'content_type' => $declaration['input']['content_type'] ?? 'application/json',
            'properties'   => $input,
        ];

        $record = $declaration['responses'][$status]['body'] ?? null;

        if (!is_array($record)) {
            return $declaration;
        }

        $answered = [];
        foreach ($published as $name => $list) {
            $answered[$name] = ['items' => $record] + $list;
        }

        $declaration['responses'][$status]['description'] = 'What each list did. A record WooCommerce could not process carries an error in place of its fields.';
        $declaration['responses'][$status]['body']        = ['type' => 'object', 'properties' => $answered];

        return $declaration;
    }

    /**
     * The captures in a registered route, as a lookup.
     *
     * @return array<string, true>
     */
    private static function captures(string $route): array
    {
        preg_match_all('/\(\?P<(\w+)>/', $route, $matches);

        return array_fill_keys($matches[1], true);
    }

    /**
     * @param array<string, mixed> $declaration
     */
    private static function successStatus(array $declaration): ?string
    {
        foreach (array_keys($declaration['responses'] ?? []) as $status) {
            if (str_starts_with((string) $status, '2')) {
                return (string) $status;
            }
        }

        return null;
    }

    /**
     * A WooCommerce delete answers with the record it removed.
     *
     * Core can trash instead, so a described core delete answers with either the
     * record or a `{ deleted, previous }` report, and discovery describes that
     * union. WooCommerce has no such envelope on any `wc/v3` resource: its
     * controllers end `delete_item()` by preparing the object, trashed or gone,
     * so the union publishes a branch that never arrives.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    private static function deleted(array $declaration): array
    {
        $body = $declaration['responses']['200']['body'] ?? null;

        if (!is_array($body) || !is_array($body['anyOf'] ?? null)) {
            return $declaration;
        }

        foreach ($body['anyOf'] as $branch) {
            if (is_array($branch) && isset($branch['$ref'])) {
                $declaration['responses']['200']['body'] = $branch;
                break;
            }
        }

        return $declaration;
    }

    /**
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    private static function zoneLocations(array $declaration): array
    {
        $status   = self::successStatus($declaration);
        $location = $status === null ? null : ($declaration['responses'][$status]['body'] ?? null);
        $zone     = $declaration['input']['properties']['id'] ?? null;

        // A location is the shape this very route answers with, and the zone is
        // an argument it registers, so neither is written out here: a release
        // that adds a location type carries it into the body by itself.
        if (!is_array($location) || !is_array($zone)) {
            return $declaration;
        }

        $declaration['input'] = [
            'params' => [
                'type'       => 'object',
                'properties' => ['id' => ['required' => true] + $zone],
            ],
            'body' => [
                'type'         => 'array',
                'content_type' => 'application/json',
                'description'  => 'The locations the zone should have after the call. Sent as the JSON body itself, not wrapped in an object.',
                'items'        => $location,
            ],
        ];

        // `update_items()` ends on `get_items()`, so the answer is the list it
        // just wrote rather than one location.
        $declaration['responses'][$status]['body'] = ['type' => 'array', 'items' => $location];

        return $declaration;
    }

    /**
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    private static function store(array $declaration, string $route): array
    {
        $declaration = self::stored($declaration, $route);
        $declaration = self::removed($declaration);

        $properties = $declaration['input']['properties'] ?? null;

        if (!is_array($properties)) {
            return self::singleton($declaration, $route);
        }

        $properties = self::requiredArguments($properties, $route);

        if ($route === self::UPDATE_CUSTOMER) {
            $properties = self::partialAddresses($properties);
        }

        if (str_starts_with($route, '/order/')) {
            $properties['key'] = [
                'type'        => 'string',
                'description' => 'The order key required to authorize a guest order.',
            ];
            $properties['billing_email'] = [
                'type'        => 'string',
                'format'      => 'email',
                'description' => 'The billing email required to authorize a guest order.',
            ];
        }

        if ($route === '/checkout' || str_starts_with($route, '/checkout/')) {
            $properties = self::checkout($properties, $route, (string) ($declaration['operation'] ?? ''));
        }

        $declaration['input']['properties'] = $properties;

        return self::singleton($declaration, $route);
    }

    /**
     * A POST on a literal path reads as a create, and a create is assumed to
     * answer `201`. Most Store API mutations answer `200`: they hand back the
     * cart they just changed rather than a record they made.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    private static function stored(array $declaration, string $route): array
    {
        if (($declaration['operation'] ?? '') !== 'create' || in_array($route, self::STORE_CREATED, true)) {
            return $declaration;
        }

        $created = $declaration['responses']['201'] ?? null;

        if (!is_array($created)) {
            return $declaration;
        }

        unset($declaration['responses']['201']);

        $declaration['responses'] = ['200' => $created] + $declaration['responses'];

        return $declaration;
    }

    /**
     * What the Store API answers a delete with.
     *
     * Core can trash, so a described delete answers with the record or a
     * `{ deleted, previous }` report, and a discovered one carries that union.
     * The Store API has no such thing: a cart item is removed or it is not.
     * `CartItemsByKey` and `CartCouponsByCode` end on `new WP_REST_Response(null,
     * 204)`, and the clear-out routes on `new WP_REST_Response([], 200)`.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    private static function removed(array $declaration): array
    {
        $operation = $declaration['operation'] ?? '';

        if ($operation === 'delete') {
            $declaration['responses'] = [
                '204' => ['description' => 'No content. Read the cart back to see what it looks like now.'],
            ];

            return $declaration;
        }

        if ($operation !== 'delete_all') {
            return $declaration;
        }

        $declaration['responses'] = [
            '200' => [
                'description'  => 'An empty list. WooCommerce answers a clear-out with `[]` rather than the records it removed.',
                'content_type' => 'application/json',
                'body'         => ['type' => 'array', 'items' => ['type' => 'object', 'additionalProperties' => true]],
            ],
        ];

        return $declaration;
    }

    /**
     * The customer update merges whatever arrives, so every address field on it
     * is optional.
     *
     * `CartUpdateCustomer` reads the address off the request and merges it into
     * the customer, and WooCommerce registers the fields required all the same.
     * Describing that literally publishes an operation no partial update can
     * satisfy: a caller changing a postcode would have to resend a whole
     * address.
     *
     * @param array<string, mixed> $properties
     * @return array<string, mixed>
     */
    private static function partialAddresses(array $properties): array
    {
        $scalar = ['anyOf' => [['type' => 'string'], ['type' => 'boolean']]];

        foreach (['billing_address', 'shipping_address'] as $name) {
            $fields = $properties[$name]['properties'] ?? null;

            if (!is_array($fields)) {
                continue;
            }

            foreach ($fields as $field => $property) {
                unset($property['required']);
                $fields[$field] = $property;
            }

            $properties[$name]['properties']           = $fields;
            $properties[$name]['additionalProperties'] = $scalar;
        }

        return $properties;
    }

    /**
     * The two Store API reads that are one record rather than a collection.
     *
     * A `GET` on a path that ends in a literal looks like a collection, and for
     * `/products` or `/cart/items` it is one. `/cart` and `/checkout` are the
     * exceptions: a session has exactly one of each, and WooCommerce answers with
     * the object itself. Left alone, the contract would publish `list` returning
     * `WP_WoocommerceStoreCart[]` and every caller would index into an array that
     * never arrives.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    private static function singleton(array $declaration, string $route): array
    {
        if (!in_array($route, ['/cart', '/checkout', '/products/collection-data'], true) || ($declaration['operation'] ?? '') !== 'list') {
            return $declaration;
        }

        $declaration['operation'] = 'retrieve';

        $body = $declaration['responses']['200']['body'] ?? null;

        if (is_array($body) && ($body['type'] ?? '') === 'array' && is_array($body['items'] ?? null)) {
            $declaration['responses']['200']['body'] = $body['items'];
        }

        if (isset($declaration['summary'])) {
            $declaration['summary'] = sprintf('Retrieve the %s', ltrim($route, '/'));
        }

        return $declaration;
    }

    /**
     * Arguments a cart handler reads unconditionally while WooCommerce registers
     * them optional. Describing them as declared publishes a call that cannot
     * work: `remove-item` with no key reaches `woocommerce_rest_cart_invalid_key`
     * every time.
     *
     * A name with no argument behind it is left alone, so a WooCommerce release
     * that renames one costs this operation its overlay rather than its whole
     * description. The PHPUnit suite compares every name against the live route.
     *
     * @param array<string, mixed> $properties
     * @return array<string, mixed>
     */
    private static function requiredArguments(array $properties, string $route): array
    {
        foreach (StoreApiSchemas::REQUIRED_ARGUMENTS[$route] ?? [] as $name) {
            if (isset($properties[$name]) && is_array($properties[$name])) {
                $properties[$name]['required'] = true;
            }
        }

        return $properties;
    }

    /**
     * Keep checkout mutations open to store-registered fields and gateways, then
     * apply the requiredness the processing handlers enforce.
     *
     * @param array<string, mixed> $properties
     * @return array<string, mixed>
     */
    private static function checkout(array $properties, string $route, string $operation): array
    {
        // Honoured by `CheckoutSchema` without being registered, so it reaches
        // the contract by hand or not at all. Only the update takes it: a
        // submission always totals the order it is paying for.
        if ($operation === 'update') {
            $properties['__experimental_calc_totals'] = [
                'type'        => 'boolean',
                'description' => 'Recalculate the order totals from the cart before answering.',
            ];
        }

        $scalar = ['anyOf' => [['type' => 'string'], ['type' => 'boolean']]];

        foreach (['billing_address', 'shipping_address', 'additional_fields'] as $name) {
            if (isset($properties[$name])) {
                $properties[$name]['additionalProperties'] = $scalar;
            }
        }

        if (isset($properties['extensions'])) {
            $properties['extensions']['additionalProperties'] = true;
        }

        if (isset($properties['payment_method'])) {
            unset($properties['payment_method']['enum']);
        }

        // Only a submission enforces these. A plain update is a partial edit of a
        // draft, so requiring an address on it would publish a call nobody makes.
        if ($operation === 'create' || $operation === 'update_by_id') {
            foreach (['billing_address', 'payment_method'] as $name) {
                if (isset($properties[$name])) {
                    $properties[$name]['required'] = true;
                }
            }

            if (isset($properties['shipping_address'])) {
                unset($properties['shipping_address']['required']);
            }
        }

        // The retry route is verified by the order key rather than by the cart
        // session. WooCommerce reads both off the request without registering
        // either, so they reach the contract here or not at all.
        if ($operation === 'update_by_id') {
            $properties['key'] = [
                'type'        => 'string',
                'required'    => true,
                'description' => 'The order key, which is how a guest proves the order is theirs. Ignored for an order that belongs to the signed-in customer.',
            ];
            $properties['billing_email'] = [
                'type'        => 'string',
                'format'      => 'email',
                'description' => 'The billing email on the order, checked alongside the key on a guest retry.',
            ];
        }

        return $properties;
    }
}
