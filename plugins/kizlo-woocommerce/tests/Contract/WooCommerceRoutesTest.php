<?php

namespace Kizlo\WooCommerce\Tests\Contract;

use Automattic\WooCommerce\StoreApi\Routes\V1\AbstractRoute;
use Automattic\WooCommerce\StoreApi\SchemaController;
use Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema;
use Automattic\WooCommerce\StoreApi\Schemas\V1\AbstractSchema;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Kizlo\Modules\Introspection\ManagedContent;
use Kizlo\Modules\Introspection\PathNormalizer;
use Kizlo\Modules\Introspection\Registry;
use Kizlo\WooCommerce\Modules\Contract\ContractModule;
use Kizlo\WooCommerce\Modules\Contract\RouteCorrections;
use Kizlo\WooCommerce\Modules\Contract\StoreApiSchemas;
use Kizlo\WooCommerce\Modules\Contract\WooCommerceNamespaces;
use Kizlo\WooCommerce\Tests\TestCase;

/**
 * A `wc/v3` resource that does not exist until a test registers it.
 *
 * Its schema is a public property rather than a literal, because the point of
 * the fixture is changing what WooCommerce publishes and watching the contract
 * follow. The callback is named `get_items`, which is a name core recognizes,
 * so this takes the ordinary controller derivation path.
 */
class ProbeController extends \WP_REST_Controller
{
    /** @var array<string, array<string, mixed>> */
    public array $properties = [
        'probe' => ['type' => 'string', 'description' => 'A probe field.', 'context' => ['view', 'edit']],
    ];

    /** @return array<string, mixed> */
    public function get_item_schema(): array
    {
        return ['title' => 'probe', 'type' => 'object', 'properties' => $this->properties];
    }

    public function get_items($request): \WP_REST_Response
    {
        return new \WP_REST_Response([], 200);
    }
}

/** The schema half of the Store API fixture, changeable for the same reason. */
class ProbeSchema extends AbstractSchema
{
    protected $title = 'probe-item';

    /** @var array<string, array<string, mixed>> */
    public array $fields = [
        'probe' => ['type' => 'string', 'description' => 'A probe field.', 'context' => ['view']],
    ];

    /** @return array<string, array<string, mixed>> */
    public function get_properties(): array
    {
        return $this->fields;
    }
}

/**
 * A Store API route built the way WooCommerce builds its own: a schema object
 * behind an `AbstractRoute`, reached through `get_response`.
 *
 * `get_response` is not a name core recognizes, so nothing about this route can
 * be derived by the controller path. It exists to prove the response filter
 * reaches a route that was not written down anywhere.
 */
class ProbeRoute extends AbstractRoute
{
    public function get_path(): string
    {
        return '/probe-items';
    }

    /** @return array<int|string, mixed> */
    public function get_args(): array
    {
        return [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_response'],
                'permission_callback' => '__return_true',
            ],
            'schema' => [$this, 'get_item_schema'],
        ];
    }
}

/**
 * Every WooCommerce route WordPress serves is described, and nothing lists them.
 *
 * This suite used to compare a written catalogue of seventeen operations against
 * the routes behind them. There is no catalogue now, so the comparison runs the
 * other way: the route table is the expectation and the contract has to cover it.
 * A WooCommerce release that adds a route fails here if discovery stops reaching
 * it, and passes without a line changing if it does.
 */
class WooCommerceRoutesTest extends TestCase
{
    public function test_the_suite_boots_with_woocommerce_and_its_store_api(): void
    {
        $this->assertTrue(defined('KIZLO_WOOCOMMERCE_VERSION'));
        $this->assertTrue(class_exists(\WooCommerce::class));
        $this->assertTrue(class_exists(StoreApi::class));
    }

    /**
     * The test the whole design exists for. No sample, no allowlist, no count.
     *
     * Paths rather than `(path, method)` pairs, because one editable handler is
     * one operation: {@see \Kizlo\Modules\CoreApi\RouteMethods} collapses the
     * POST, PUT and PATCH that WooCommerce registers together into a single
     * `update` and publishes it under one representative method. Demanding an
     * operation per verb would assert against that on purpose.
     */
    public function test_every_registered_woocommerce_path_is_described(): void
    {
        $described = $this->describedRoutes();
        $missing   = array_values(array_diff(
            array_keys($this->registeredRoutes()),
            array_keys($described),
        ));

        $this->assertSame([], $missing, 'WooCommerce paths the contract does not describe.');
    }

    /** And nothing is described with a method its route does not accept. */
    public function test_no_described_method_is_one_the_route_rejects(): void
    {
        $registered = $this->registeredRoutes();
        $invented   = [];

        foreach ($this->describedRoutes() as $path => $methods) {
            foreach (array_keys($methods) as $method) {
                if (!in_array($method, $registered[$path] ?? [], true)) {
                    $invented[] = sprintf('%s %s', $method, $path);
                }
            }
        }

        $this->assertSame([], $invented, 'Described methods WooCommerce does not serve.');
    }

    /**
     * The old catalogue stopped at seventeen Store API operations and ten `wc/v3`
     * ones. Reports, settings, system status, webhooks, taxes and the rest of
     * `wc/v3` are reachable now, so the surface is far wider than any written list.
     */
    public function test_the_described_surface_is_not_a_fixed_catalogue(): void
    {
        $operations = 0;

        foreach ($this->describedRoutes() as $methods) {
            $operations += count($methods);
        }

        $this->assertGreaterThan(27, $operations);
    }

    /**
     * The claim the deletion rests on: a route nobody here has heard of is
     * described, and a schema change is followed.
     *
     * The count above only says the surface is wider than the catalogue was. This
     * registers two routes that exist nowhere in the repository, one per
     * namespace and one of them of a design core cannot read, then changes what
     * both publish and rebuilds. A catalogue would answer the same both times.
     */
    public function test_a_route_registered_after_the_fact_is_described(): void
    {
        $container  = StoreApi::container();
        $controller = new ProbeController();
        $schema     = new ProbeSchema($container->get(ExtendSchema::class), $container->get(SchemaController::class));
        $route      = new ProbeRoute($container->get(SchemaController::class), $schema);

        $register = static function () use ($controller, $route): void {
            register_rest_route(WooCommerceNamespaces::REST, '/probes', [[
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$controller, 'get_items'],
                'permission_callback' => '__return_true',
            ]]);

            register_rest_route(WooCommerceNamespaces::STORE, $route->get_path(), $route->get_args());
        };

        add_action('rest_api_init', $register);

        try {
            $document  = $this->rebuiltDocument();
            $described = $this->describedRoutes($document);

            $this->assertArrayHasKey(
                WooCommerceNamespaces::REST . '/probes',
                $described,
                'A wc/v3 route registered after the code was written is not described.',
            );
            $this->assertArrayHasKey(
                WooCommerceNamespaces::STORE . '/probe-items',
                $described,
                'A Store API route registered after the code was written is not described.',
            );

            foreach ([[WooCommerceNamespaces::REST, '/probes'], [WooCommerceNamespaces::STORE, '/probe-items']] as [$namespace, $path]) {
                $properties = $this->publishedProperties($document, $namespace, $path);

                $this->assertArrayHasKey('probe', $properties, sprintf('%s%s published no derived response.', $namespace, $path));
                $this->assertArrayNotHasKey('probe_count', $properties);
            }

            // The same objects the route table holds, so the next build reads the
            // changed schema off the routes rather than off a rebuilt fixture.
            $controller->properties['probe_count'] = ['type' => 'integer', 'description' => 'A probe count.', 'context' => ['view', 'edit']];
            $schema->fields['probe_count']         = ['type' => 'integer', 'description' => 'A probe count.', 'context' => ['view']];

            $rebuilt = $this->rebuiltDocument();

            foreach ([[WooCommerceNamespaces::REST, '/probes'], [WooCommerceNamespaces::STORE, '/probe-items']] as [$namespace, $path]) {
                $this->assertArrayHasKey(
                    'probe_count',
                    $this->publishedProperties($rebuilt, $namespace, $path),
                    sprintf('%s%s did not follow its published schema.', $namespace, $path),
                );
            }
        } finally {
            remove_action('rest_api_init', $register);
        }
    }

    /**
     * Both namespaces serve `/products`, and an API ID is the path's literals, so
     * without a prefix the second one loses its API to a namespace collision.
     */
    public function test_the_two_namespaces_get_distinct_api_ids(): void
    {
        $apis = $this->document()['apis'];

        $this->assertSame(WooCommerceNamespaces::REST, $apis['woocommerce.products']['namespace']);
        $this->assertSame(WooCommerceNamespaces::STORE, $apis['woocommerce.store.products']['namespace']);
    }

    /**
     * A zone's locations are replaced wholesale, so the body is the list itself.
     * WooCommerce registers no arguments for it, and a flat object schema cannot
     * describe an array body at all.
     */
    public function test_the_shipping_zone_locations_put_takes_a_bare_array_body(): void
    {
        $apis      = $this->document()['apis'];
        $paths     = $apis['woocommerce.shipping.zones.locations']['paths'] ?? [];
        $operation = $paths['/shipping/zones/{id}/locations']['update'] ?? null;

        $this->assertNotNull($operation, 'The shipping-zone locations route was not described.');
        // Registered `EDITABLE`, so PUT and PATCH reach one handler and the
        // pair is published as a single `update` under the preferred verb.
        $this->assertSame('PATCH', $operation['method']);
        $this->assertSame('array', $operation['input']['body']['type']);
        $this->assertSame('application/json', $operation['input']['body']['content_type']);
        $this->assertArrayHasKey('id', $operation['input']['params']['properties']);
        $this->assertArrayNotHasKey('properties', $operation['input']['body']);
    }

    /**
     * WooCommerce registers these optional and reads them unconditionally, so the
     * overlay is what keeps the contract from publishing a call that cannot work.
     * Comparing every name against the live route is the alarm for a rename.
     */
    public function test_every_required_argument_overlay_still_matches_a_live_route(): void
    {
        $this->bootRestServer();

        $stale = [];

        foreach (StoreApiSchemas::REQUIRED_ARGUMENTS as $path => $names) {
            $registered = rest_get_server()->get_routes()[sprintf('/%s%s', WooCommerceNamespaces::STORE, $path)] ?? null;

            if (!is_array($registered)) {
                $stale[] = sprintf('%s is not registered', $path);
                continue;
            }

            $args = [];
            foreach ($registered as $handler) {
                $args += is_array($handler['args'] ?? null) ? $handler['args'] : [];
            }

            foreach ($names as $name) {
                if (!isset($args[$name])) {
                    $stale[] = sprintf('%s has no "%s" argument', $path, $name);
                }
            }
        }

        // Keyed by the registered route rather than the readable path, so an
        // upstream change to the capture stops the overlay matching in silence.
        foreach (RouteCorrections::UNTYPED_ARGUMENTS as $route => $arguments) {
            $registered = rest_get_server()->get_routes()[$route] ?? null;

            if (!is_array($registered)) {
                $stale[] = sprintf('%s is not registered', $route);
                continue;
            }

            $args = [];
            foreach ($registered as $handler) {
                $args += is_array($handler['args'] ?? null) ? $handler['args'] : [];
            }

            foreach (array_keys($arguments) as $name) {
                if (!isset($args[$name])) {
                    $stale[] = sprintf('%s has no "%s" argument', $route, $name);
                }
            }
        }

        $this->assertSame([], $stale, 'Argument overlays that no longer match WooCommerce.');
    }

    /**
     * A route nothing describes answers opaquely, never with a named schema
     * carrying no fields. Sharing one would be worse than vague: an empty
     * property set hashes to a single fingerprint, so two undescribed routes
     * would each answer as whichever unrelated record claimed the ID first.
     */
    public function test_no_described_response_is_a_schema_with_no_fields(): void
    {
        $empty = array_keys(array_filter(
            $this->document()['schemas'],
            static fn(array $schema): bool => ($schema['properties'] ?? null) === [],
        ));

        $this->assertSame([], $empty, 'Schemas published with no properties.');
    }

    /**
     * Kizlo adds these through response filters, which have no schema half for
     * the derivation to find.
     */
    public function test_the_kizlo_additions_survive_discovery(): void
    {
        $document = $this->document();
        $schemas  = $document['schemas'];

        $this->assertArrayHasKey('kizlo', $schemas['woocommerce.products']['properties']);
        $this->assertArrayHasKey('kizlo', $schemas['woocommerce.store.products-collection-data']['properties']);
        $this->assertArrayHasKey('__experimentalCart', $schemas['woocommerce.store.checkout']['properties']);
    }

    /** WooCommerce wraps product reads in closures bound to their REST controller. */
    public function test_a_wrapped_rest_controller_still_contributes_its_schema(): void
    {
        $document = $this->document();
        $body     = $document['apis']['woocommerce.products']['paths']['/products/{id}']['retrieve']['responses']['200']['body'];
        $ref      = $body['$ref'] ?? null;

        $this->assertIsString($ref, 'The wrapped product controller was described opaquely.');
        $this->assertArrayHasKey('kizlo', $document['schemas'][$ref]['properties']);
    }

    /** A Store API shape is read off the route, not described as an opaque object. */
    public function test_a_store_api_response_is_derived_rather_than_opaque(): void
    {
        $cart = $this->document()['schemas']['woocommerce.store.cart']['properties'];

        $this->assertArrayHasKey('items', $cart);
        $this->assertArrayHasKey('totals', $cart);
    }

    /**
     * A batch route reads three lists off the body and answers with what each
     * one did. The registration says none of that: it carries the item's own
     * arguments and publishes the item's schema, so a derived batch describes
     * one record in and one record out.
     */
    public function test_a_batch_path_takes_and_answers_three_lists(): void
    {
        $checked = 0;

        foreach ($this->document()['apis'] as $api) {
            // WordPress serves a batch endpoint of its own, with a shape of its
            // own, and this is the WooCommerce suite.
            if (($api['namespace'] ?? '') !== WooCommerceNamespaces::REST) {
                continue;
            }

            foreach ($api['paths'] as $path => $operations) {
                if (!str_ends_with($path, '/batch')) {
                    continue;
                }

                $checked++;

                $this->assertCount(1, $operations, sprintf('%s publishes more than one operation.', $path));

                $operation = reset($operations);
                $response  = $operation['responses']['200']['body'] ?? [];

                $this->assertSame(
                    ['create', 'update', 'delete'],
                    array_keys($operation['input']['body']['properties'] ?? []),
                    sprintf('%s does not take the three lists.', $path),
                );
                $this->assertSame('array', $operation['input']['body']['properties']['delete']['type'] ?? null);
                $this->assertSame(
                    ['create', 'update', 'delete'],
                    array_keys($response['properties'] ?? []),
                    sprintf('%s does not answer with the three lists.', $path),
                );
                $this->assertArrayHasKey('$ref', $response['properties']['create']['items'] ?? []);

                // A capture addresses the record the batch belongs to and is no
                // part of the lists, so it has to survive the rewrite.
                foreach (array_keys($this->captures($path)) as $capture) {
                    $this->assertArrayHasKey(
                        $capture,
                        $operation['input']['params']['properties'] ?? [],
                        sprintf('%s lost its %s parameter.', $path, $capture),
                    );
                }
            }
        }

        $this->assertGreaterThan(10, $checked, 'The batch routes were not reached.');
    }

    /**
     * The zone locations handler is registered `EDITABLE`, so POST reaches the
     * same `update_items()` that PUT and PATCH do. Published as a `create`, it
     * reads as adding one location while it replaces every location there is.
     */
    public function test_the_zone_locations_route_publishes_no_phantom_create(): void
    {
        $operations = $this->document()['apis']['woocommerce.shipping.zones.locations']['paths']['/shipping/zones/{id}/locations'];

        $this->assertSame(['list', 'update'], $this->sorted(array_keys($operations)));

        // `update_items()` ends on `get_items()`, so the answer is the list.
        $body = $operations['update']['responses']['200']['body'];

        $this->assertSame('array', $body['type'] ?? null);
        $this->assertArrayHasKey('$ref', $body['items'] ?? []);
    }

    /**
     * The cart merges whatever arrives, so a caller changing a postcode does not
     * have to resend a whole address.
     */
    public function test_the_customer_update_takes_a_partial_address(): void
    {
        $body = $this->document()['apis']['woocommerce.store.cart.updateCustomer']
            ['paths']['/cart/update-customer']['create']['input']['body'];

        foreach (['billing_address', 'shipping_address'] as $address) {
            foreach ($body['properties'][$address]['properties'] as $field => $property) {
                $this->assertArrayNotHasKey(
                    'required',
                    $property,
                    sprintf('%s.%s is required, so no partial update can be expressed.', $address, $field),
                );
            }
        }
    }

    /**
     * The status a handler answers with lives in a `set_status()` call inside its
     * body, and nothing publishes it, so discovery has to guess: a POST on a
     * literal path reads as a create, and a create is assumed to answer `201`.
     * Most cart mutations answer `200`. This drives every described cart
     * operation and compares what comes back against what the contract says
     * comes back, shape included.
     *
     * The order is a cart lifecycle rather than a list, because each call needs
     * the state the one before it left: an item key to update, a coupon to
     * remove, an item to delete.
     *
     * One described operation is not driven here: `/cart/extensions` answers
     * nothing until some other plugin registers an extension callback, so it
     * remains described from derivation alone.
     */
    public function test_a_cart_route_answers_what_it_declares(): void
    {
        $this->bootRestServer();

        add_filter('woocommerce_store_api_disable_nonce_check', '__return_true');
        wc_load_cart();

        $product = new \WC_Product_Simple();
        $product->set_name('Kizlo probe');
        $product->set_regular_price('10');
        $product->save();

        $coupon = new \WC_Coupon();
        $coupon->set_code('kizlo-probe');
        $coupon->set_discount_type('fixed_cart');
        $coupon->set_amount(1);
        $coupon->save();

        // Zone 0 covers everything the other zones do not, so one method on it is
        // enough for the cart to have a rate to select.
        $zone = new \WC_Shipping_Zone(0);
        $zone->add_shipping_method('flat_rate');
        $zone->save();

        $add      = ['id' => $product->get_id(), 'quantity' => 1];
        $observed = [];

        $observed[] = ['/cart', 'GET', $this->dispatch('GET', '/cart')];
        $observed[] = ['/cart/add-item', 'POST', $this->dispatch('POST', '/cart/add-item', $add)];

        $key = (string) array_key_first(WC()->cart->get_cart());

        $observed[] = ['/cart/items', 'GET', $this->dispatch('GET', '/cart/items')];
        $observed[] = ['/cart/items/{key}', 'GET', $this->dispatch('GET', '/cart/items/' . $key)];
        $observed[] = ['/cart/update-item', 'POST', $this->dispatch('POST', '/cart/update-item', ['key' => $key, 'quantity' => 2])];
        $observed[] = ['/cart/items/{key}', 'PATCH', $this->dispatch('PATCH', '/cart/items/' . $key, ['quantity' => 3])];
        $observed[] = ['/cart/update-customer', 'POST', $this->dispatch('POST', '/cart/update-customer', [
            'billing_address'  => ['postcode' => '90210'],
            'shipping_address' => ['country' => 'US', 'state' => 'CA', 'postcode' => '90210'],
        ])];
        $observed[] = ['/cart/select-shipping-rate', 'POST', $this->dispatch('POST', '/cart/select-shipping-rate', $this->shippingSelection())];

        // Applied through the verb route, read back through the resource route,
        // then removed, so the pair that describes one behaviour under two paths
        // is both exercised and compared.
        $observed[] = ['/cart/apply-coupon', 'POST', $this->dispatch('POST', '/cart/apply-coupon', ['code' => 'kizlo-probe'])];
        $observed[] = ['/cart/coupons', 'GET', $this->dispatch('GET', '/cart/coupons')];
        $observed[] = ['/cart/coupons/{code}', 'GET', $this->dispatch('GET', '/cart/coupons/kizlo-probe')];
        $observed[] = ['/cart/remove-coupon', 'POST', $this->dispatch('POST', '/cart/remove-coupon', ['code' => 'kizlo-probe'])];
        $observed[] = ['/cart/coupons', 'POST', $this->dispatch('POST', '/cart/coupons', ['code' => 'kizlo-probe'])];
        $observed[] = ['/cart/coupons/{code}', 'DELETE', $this->dispatch('DELETE', '/cart/coupons/kizlo-probe')];
        $observed[] = ['/cart/coupons', 'DELETE', $this->dispatch('DELETE', '/cart/coupons')];

        // `POST /cart/items` carries an explicit empty `extensions` because the
        // default WooCommerce computes for that argument fails its own validation,
        // so the route answers 400 to a request that leaves it out. KIZ-209 covers
        // the described input; the status below is what this test is asserting.
        $create = $add + ['extensions' => new \stdClass()];

        $observed[] = ['/cart/remove-item', 'POST', $this->dispatch('POST', '/cart/remove-item', ['key' => $key])];
        $observed[] = ['/cart/items', 'POST', $this->dispatch('POST', '/cart/items', $create)];
        $observed[] = ['/cart/items/{key}', 'DELETE', $this->dispatch('DELETE', '/cart/items/' . (string) array_key_first(WC()->cart->get_cart()))];
        $observed[] = ['/cart/items', 'POST', $this->dispatch('POST', '/cart/items', $create)];
        $observed[] = ['/cart/items', 'DELETE', $this->dispatch('DELETE', '/cart/items')];

        remove_filter('woocommerce_store_api_disable_nonce_check', '__return_true');

        $problems = [];

        foreach ($observed as [$path, $method, $response]) {
            $declared = $this->declaredResponse($path, $method);
            $status   = (string) $response->get_status();
            $where    = sprintf('%s %s', $method, $path);

            if ($status !== $declared['status']) {
                $problems[] = sprintf('%s answers %s%s, described as %s', $where, $status, $this->reason($response), $declared['status']);
                continue;
            }

            if (!$declared['body'] && $response->get_data() !== null) {
                $problems[] = sprintf('%s answers with a body, described as answering none', $where);
                continue;
            }

            $undescribed = $this->undescribedFields($response->get_data(), $declared['properties']);

            if ($undescribed !== []) {
                $problems[] = sprintf('%s answers with undescribed fields: %s', $where, implode(', ', $undescribed));
            }
        }

        $this->assertSame([], $problems, 'Cart routes answering something other than what the contract describes.');
    }

    // ============================================================
    // HARNESS
    // ============================================================

    /**
     * The placeholders in a readable path, as a lookup.
     *
     * @return array<string, true>
     */
    private function captures(string $path): array
    {
        preg_match_all('/\{(\w+)\}/', $path, $matches);

        return array_fill_keys($matches[1], true);
    }

    /**
     * @param array<string, mixed> $body
     */
    private function dispatch(string $method, string $path, array $body = []): \WP_REST_Response
    {
        $request = new \WP_REST_Request($method, sprintf('/%s%s', WooCommerceNamespaces::STORE, $path));

        if ($body !== []) {
            $request->set_header('content-type', 'application/json');
            $request->set_body((string) wp_json_encode($body));
        }

        return rest_get_server()->dispatch($request);
    }

    /**
     * The success status and response shape one described operation publishes.
     *
     * @return array{status: string, body: bool, properties: array<string, mixed>}
     */
    private function declaredResponse(string $path, string $method): array
    {
        $document = $this->document();

        foreach ($document['apis'] as $api) {
            foreach ($api['paths'][$path] ?? [] as $operation) {
                if ($operation['method'] !== $method) {
                    continue;
                }

                foreach ($operation['responses'] as $status => $response) {
                    if (!str_starts_with((string) $status, '2')) {
                        continue;
                    }

                    $body = (array) ($response['body'] ?? []);

                    return [
                        'status'     => (string) $status,
                        'body'       => $body !== [],
                        'properties' => $this->declaredProperties($body, $document['schemas']),
                    ];
                }
            }
        }

        return ['status' => 'undescribed', 'body' => false, 'properties' => []];
    }

    /**
     * The fields a described body publishes, through whichever `$ref` and array
     * wrapper stand between the operation and the record.
     *
     * @param array<string, mixed> $body
     * @param array<string, mixed> $schemas
     * @return array<string, mixed>
     */
    private function declaredProperties(array $body, array $schemas): array
    {
        // Bounded rather than recursive: a body is a ref, an array, or a shape,
        // and a document that disagrees should fail a test rather than hang one.
        for ($step = 0; $step < 4; $step++) {
            if (is_string($body['$ref'] ?? null)) {
                $body = (array) ($schemas[$body['$ref']] ?? []);
                continue;
            }

            if (($body['type'] ?? null) === 'array') {
                $body = (array) ($body['items'] ?? []);
                continue;
            }

            break;
        }

        return (array) ($body['properties'] ?? []);
    }

    /**
     * A package and rate the cart can actually be told to use.
     *
     * The rate IDs a shipping method hands out are built at calculation time from
     * its instance, so they cannot be written down.
     *
     * @return array<string, string>
     */
    private function shippingSelection(): array
    {
        WC()->cart->calculate_totals();

        $packages = WC()->shipping()->get_packages();
        $package  = (string) array_key_first($packages);
        $rate     = (string) array_key_first($packages[$package]['rates'] ?? []);

        $this->assertNotSame('', $rate, 'No shipping rate was calculated, so the route cannot be driven.');

        return ['package_id' => $package, 'rate_id' => $rate];
    }

    /** The error behind an unexpected status, so a failure names the reason. */
    private function reason(\WP_REST_Response $response): string
    {
        $data = $response->get_data();

        if (!is_array($data) || !is_string($data['code'] ?? null)) {
            return '';
        }

        return sprintf(' (%s: %s)', $data['code'], is_string($data['message'] ?? null) ? $data['message'] : '');
    }

    /**
     * Fields a route answered with that its description does not name.
     *
     * A list is judged by its first entry, which is the record the description
     * names; an empty one has nothing to disagree about.
     *
     * `_links` is WordPress's own envelope rather than a field of the resource.
     * It is merged into every collection entry on the way out and described
     * nowhere in the contract, core routes included, so it is not a disagreement.
     *
     * @param array<string, mixed> $properties
     * @return array<int, string>
     */
    private function undescribedFields(mixed $data, array $properties): array
    {
        $item = is_array($data) && array_is_list($data) ? ($data[0] ?? null) : $data;

        if (!is_array($item)) {
            return [];
        }

        $undescribed = array_diff(array_keys($item), array_keys($properties), ['_links']);

        return $this->sorted(array_map('strval', $undescribed));
    }

    /**
     * The response fields published for a route, found by where it is registered
     * rather than by the API ID discovery derives for it.
     *
     * @param array<string, mixed> $document
     * @return array<string, mixed>
     */
    private function publishedProperties(array $document, string $namespace, string $path): array
    {
        foreach ($document['apis'] as $api) {
            if (($api['namespace'] ?? '') !== $namespace) {
                continue;
            }

            foreach ($api['paths'][$path] ?? [] as $operation) {
                foreach ($operation['responses'] as $status => $response) {
                    if (str_starts_with((string) $status, '2')) {
                        return $this->declaredProperties((array) ($response['body'] ?? []), $document['schemas']);
                    }
                }
            }
        }

        return [];
    }

    /**
     * @param array<int, string> $values
     * @return array<int, string>
     */
    private function sorted(array $values): array
    {
        sort($values);

        return $values;
    }

    /** @return array<string, mixed> */
    private function document(): array
    {
        static $document = null;

        return $document ??= $this->rebuiltDocument();
    }

    /**
     * A document built from the route table as it stands now, rather than the
     * memoized one. The memo is there because building the whole WooCommerce
     * contract is not cheap; a test that changes what WooCommerce registers has
     * to pay for it.
     *
     * @return array<string, mixed>
     */
    private function rebuiltDocument(): array
    {
        (new ContractModule())->describe();
        $this->bootRestServer();
        ManagedContent::flush();

        return Registry::build();
    }

    /**
     * Every `(path, method)` the contract publishes for the two namespaces.
     *
     * Keyed by the readable path the document uses, `/products/{id}` rather than
     * the registration's regex, so the route table has to be normalized the same
     * way before the two can be compared.
     *
     * @param array<string, mixed>|null $document
     * @return array<string, array<string, true>>
     */
    private function describedRoutes(?array $document = null): array
    {
        $found = [];

        foreach (($document ?? $this->document())['apis'] as $api) {
            $namespace = $api['namespace'] ?? '';

            if (!in_array($namespace, [WooCommerceNamespaces::REST, WooCommerceNamespaces::STORE], true)) {
                continue;
            }

            foreach ($api['paths'] as $path => $operations) {
                foreach ($operations as $operation) {
                    $found[sprintf('%s%s', $namespace, $path)][$operation['method']] = true;
                }
            }
        }

        return $found;
    }

    /**
     * @return array<string, array<int, string>>
     */
    private function registeredRoutes(): array
    {
        $found = [];

        foreach (rest_get_server()->get_routes() as $route => $handlers) {
            foreach ([WooCommerceNamespaces::REST, WooCommerceNamespaces::STORE] as $namespace) {
                $prefix = '/' . $namespace;

                if ($route === $prefix || !str_starts_with($route, $prefix . '/')) {
                    continue;
                }

                $normalized = PathNormalizer::normalize(substr($route, strlen($prefix)));

                if ($normalized['errors'] !== []) {
                    continue;
                }

                $key = $namespace . $normalized['path'];

                foreach (is_array($handlers) ? $handlers : [] as $handler) {
                    foreach (array_keys(array_filter((array) ($handler['methods'] ?? []))) as $method) {
                        $found[$key][] = (string) $method;
                    }
                }

                $found[$key] = array_values(array_unique($found[$key] ?? []));
            }
        }

        return $found;
    }
}
