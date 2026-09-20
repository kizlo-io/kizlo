<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\CoreApi\RouteDiscovery;
use Kizlo\Modules\Introspection\OperationErrors;
use Kizlo\Modules\Introspection\PathNormalizer;
use WP_REST_Server;

/**
 * The WordPress routes Kizlo describes but does not serve.
 *
 * Kizlo used to hand-declare three of them, and these tests used to compare
 * those three against the controllers behind them. There is nothing to compare
 * any more: the descriptions are derived from the route table rather than
 * written beside it, so a parameter cannot drift from what core registered
 * without the derivation itself being wrong.
 *
 * What is worth testing instead is that the derivation covers everything and
 * says the right thing about each shape. The first case is the important one —
 * every route in a described namespace reaches the document, with no exclusion
 * list, because an engine has no list to fall behind.
 */
class CoreRouteTest extends IntrospectionTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
        $this->boot();
    }

    // ============================================================
    // EVERYTHING WORDPRESS SERVES IS DESCRIBED
    // ============================================================

    /**
     * No sample and no allowlist. Every route WordPress registers in a described
     * namespace is in the document, so a route a later WordPress adds — or a
     * plugin adds this afternoon — fails here if the engine stops reaching it.
     */
    public function test_every_route_in_a_described_namespace_is_described(): void
    {
        $described = $this->describedPaths();
        $missing   = [];

        foreach ($this->servedPaths() as $path => $methods) {
            foreach ($methods as $method) {
                if (!isset($described[$path])) {
                    $missing[] = sprintf('%s %s', $method, $path);
                }
            }
        }

        $this->assertSame([], $missing, 'Routes WordPress serves that the contract does not describe.');
    }

    /**
     * The property the whole design exists for. Nothing in the plugin mentions
     * this post type; WordPress generates its routes because it was registered
     * for REST, and the contract follows without a line being written here.
     */
    public function test_a_post_type_registered_for_rest_is_described_without_being_named(): void
    {
        register_post_type('kizlo_probe', [
            'public'       => true,
            'show_in_rest' => true,
            'rest_base'    => 'kizlo-probes',
            'supports'     => ['title', 'editor'],
        ]);

        try {
            $this->boot();

            $api = $this->document()['apis']['kizloProbes'] ?? null;

            $this->assertNotNull($api, 'A post type registered for REST was not described.');
            $this->assertSame('wp/v2', $api['namespace']);
            $this->assertArrayHasKey('list', $api['paths']['/kizlo-probes']);
            $this->assertArrayHasKey('create', $api['paths']['/kizlo-probes']);
            $this->assertArrayHasKey('retrieve', $api['paths']['/kizlo-probes/{id}']);
        } finally {
            unregister_post_type('kizlo_probe');
        }
    }

    // ============================================================
    // EACH SHAPE IS DESCRIBED AS THE SHAPE IT IS
    // ============================================================

    /** A resource core addresses by name, not by row id. */
    public function test_a_named_identifier_is_described_as_a_string(): void
    {
        $type = $this->document()['apis']['types']['paths']['/types/{type}']['retrieve'];

        $this->assertSame('string', $type['input']['properties']['type']['type']);
        $this->assertTrue($type['input']['properties']['type']['required']);
    }

    /** A singleton has nothing to address, so it declares no identifier. */
    public function test_a_singleton_describes_no_identifier(): void
    {
        $settings = $this->document()['apis']['settings']['paths']['/settings'];

        $this->assertSame([], array_keys($this->inputProperties($settings['retrieve'])));
        $this->assertArrayHasKey('update', $settings);
    }

    /** A sub-resource carries the parent that scopes it. */
    public function test_a_parent_scoped_route_describes_its_parent(): void
    {
        $revision = $this->document()['apis']['posts.revisions']['paths']['/posts/{parent}/revisions/{id}']['retrieve'];

        $this->assertArrayHasKey('parent', $revision['input']['properties']);
        $this->assertArrayHasKey('id', $revision['input']['properties']);
    }

    /** The attachments controller reads `$_FILES`, so its create is not JSON. */
    public function test_an_upload_create_declares_multipart(): void
    {
        $create = $this->document()['apis']['media']['paths']['/media']['create'];

        $this->assertSame('multipart/form-data', $create['input']['content_type']);
    }

    /** A trailing literal segment is its own API rather than an operation. */
    public function test_a_trailing_segment_route_gets_its_own_api(): void
    {
        $apis = $this->document()['apis'];

        $this->assertArrayHasKey('create', $apis['widgetTypes.encode']['paths']['/widget-types/{id}/encode']);
        $this->assertArrayHasKey('retrieve', $apis['users.me']['paths']['/users/me']);
    }

    /** A second namespace is carried through, not flattened into `wp/v2`. */
    public function test_a_second_namespace_is_carried_through(): void
    {
        $api = $this->document()['apis']['directorySizes'];

        $this->assertSame('wp-site-health/v1', $api['namespace']);
        $this->assertArrayHasKey('list', $api['paths']['/directory-sizes']);
    }

    /**
     * Core registers a collection and the same collection scoped by a parameter
     * on one `get_items()`, so both arrive wanting `list`.
     */
    public function test_a_scoped_collection_does_not_take_the_plain_list_name(): void
    {
        $blockTypes = $this->document()['apis']['blockTypes']['paths'];

        $this->assertArrayHasKey('list', $blockTypes['/block-types']);
        $this->assertArrayHasKey('list_by_namespace', $blockTypes['/block-types/{namespace}']);
    }

    // ============================================================
    // WHAT DERIVATION CANNOT SEE
    // ============================================================

    /**
     * Kizlo attaches a `kizlo` block to comments and menu items after the
     * controller has built the response, so it is in no item schema and no
     * derivation can reach it. The schema filter is what puts it back.
     */
    public function test_the_kizlo_envelope_is_contributed_to_the_described_shapes(): void
    {
        $document = $this->document();

        foreach (['comments', 'menuItems'] as $apiId) {
            $ref = $document['apis'][$apiId]['paths'][$apiId === 'comments' ? '/comments' : '/menu-items']['list']['responses']['200']['body']['items']['$ref'];

            $this->assertArrayHasKey('kizlo', $document['schemas'][$ref]['properties'], $apiId);
            $this->assertArrayHasKey('extend', $document['schemas'][$ref]['properties']['kizlo']['properties'], $apiId);
        }
    }

    /** The same filter is how a site keeps a route out of its own contract. */
    public function test_a_route_can_be_omitted_through_the_filter(): void
    {
        $drop = static fn(array $declaration): ?array => $declaration['id'] === 'search' ? null : $declaration;

        add_filter(RouteDiscovery::ROUTE_FILTER, $drop);

        try {
            $this->assertArrayNotHasKey('search', $this->document()['apis']);
        } finally {
            remove_filter(RouteDiscovery::ROUTE_FILTER, $drop);
        }

        $this->assertArrayHasKey('search', $this->document()['apis']);
    }

    // ============================================================
    // ONE RESPONSE SHAPE PER OPERATION
    // ============================================================

    /**
     * `context` decides which fields a core response carries, so describing it
     * would describe an operation with more than one return type. A described
     * route has nothing to pin it with, so it is left undeclared and the response
     * is described in the context WordPress falls back to.
     */
    public function test_no_described_operation_offers_a_context_parameter(): void
    {
        foreach ($this->document()['apis'] as $apiId => $api) {
            if (!in_array($api['namespace'], RouteDiscovery::NAMESPACES, true)) {
                continue;
            }

            foreach ($api['paths'] as $path => $operations) {
                foreach ($operations as $name => $operation) {
                    $this->assertArrayNotHasKey(
                        'context',
                        $this->inputProperties($operation),
                        sprintf('%s %s %s', $apiId, $name, $path),
                    );
                }
            }
        }
    }

    // ============================================================
    // WHAT SITS IN FRONT OF A ROUTE NOBODY HERE SERVES
    // ============================================================

    /**
     * `RestGuard` leaves `wp/v2` on WordPress's own authentication, so a native
     * route inherits only what WordPress can return before dispatch and never
     * advertises the guard's own `kizlo_rest_*` codes it can no longer produce.
     */
    public function test_a_native_route_inherits_only_the_pre_dispatch_errors(): void
    {
        $errors = $this->document()['apis']['comments']['paths']['/comments']['list']['errors'];

        foreach (OperationErrors::NATIVE as $code) {
            $this->assertContains($code, $errors);
        }

        $this->assertNotContains('kizlo_rest_unauthorized', $errors);
        $this->assertNotContains('kizlo_rest_forbidden', $errors);
    }

    /**
     * Only a Kizlo-owned callback is wrapped, so only a Kizlo-owned route can
     * answer `invalid_param`. Listing it on a described route would promise a code
     * WordPress has no way to return.
     */
    public function test_a_described_route_does_not_claim_the_runtime_wrapper_error(): void
    {
        $described = $this->document()['apis']['comments']['paths']['/comments']['list']['errors'];
        $served    = $this->document()['apis']['kizlo.comments']['paths']['/comments']['create']['errors'];

        $this->assertNotContains('invalid_param', $described);
        $this->assertContains('invalid_param', $served);
    }

    // ============================================================
    // WHO OWNS WHICH NAME
    // ============================================================

    public function test_core_keeps_the_plain_name_and_the_kizlo_route_is_qualified(): void
    {
        $apis = $this->document()['apis'];

        $this->assertSame('wp/v2', $apis['comments']['namespace']);
        $this->assertSame('kizlo/v1', $apis['kizlo.comments']['namespace']);

        // The submission takes the forwarded end user; the WordPress route does not.
        $this->assertArrayHasKey('post_id', $apis['kizlo.comments']['paths']['/comments']['create']['input']['properties']);
        $this->assertArrayHasKey('post', $apis['comments']['paths']['/comments']['create']['input']['properties']);
    }

    /**
     * Nothing *this plugin* serves gets to sit on an unqualified name, because the
     * next core route described here would have to rename a client path to take
     * the name back.
     */
    public function test_every_route_this_plugin_serves_is_qualified_and_every_described_id_is_not(): void
    {
        $served    = [];
        $described = [];

        foreach ($this->document()['apis'] as $apiId => $api) {
            if ($api['namespace'] === 'kizlo/v1') {
                $served[] = (string) $apiId;
            } elseif (in_array($api['namespace'], RouteDiscovery::NAMESPACES, true)) {
                $described[] = (string) $apiId;
            }
        }

        $this->assertNotEmpty($served);
        $this->assertNotEmpty($described);

        foreach ($served as $apiId) {
            $this->assertStringStartsWith('kizlo.', $apiId);
        }

        foreach ($described as $apiId) {
            $this->assertStringStartsNotWith('kizlo.', $apiId, sprintf('%s is not served by this plugin.', $apiId));
        }
    }

    public function test_a_described_list_carries_the_pagination_headers(): void
    {
        $headers = $this->document()['apis']['posts']['paths']['/posts']['list']['responses']['200']['headers'];

        $this->assertArrayHasKey('X-WP-Total', $headers['properties']);
        $this->assertArrayHasKey('X-WP-TotalPages', $headers['properties']);
    }

    public function test_describing_these_routes_costs_no_diagnostics(): void
    {
        $this->assertSame([], $this->errors());
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * Every path the document describes in a configured namespace.
     *
     * @return array<string, true>
     */
    private function describedPaths(): array
    {
        $paths = [];

        foreach ($this->document()['apis'] as $api) {
            if (!in_array($api['namespace'], RouteDiscovery::NAMESPACES, true)) {
                continue;
            }

            foreach (array_keys($api['paths']) as $path) {
                $paths[(string) $path] = true;
            }
        }

        return $paths;
    }

    /**
     * Every path WordPress serves in a configured namespace, minus the namespace
     * roots, which are the index of the namespace rather than a resource in it.
     *
     * @return array<string, array<int, string>>
     */
    private function servedPaths(): array
    {
        $paths = [];

        foreach (rest_get_server()->get_routes() as $route => $handlers) {
            foreach (RouteDiscovery::NAMESPACES as $namespace) {
                $prefix = '/' . trim($namespace, '/');

                if ($route === $prefix || !str_starts_with($route, $prefix . '/')) {
                    continue;
                }

                // Normalized the same way the engine does. A hand-rolled regex
                // here would disagree with it on exactly the routes that are
                // hard: core nests groups inside the template id.
                $path = PathNormalizer::normalize(substr($route, strlen($prefix)))['path'];

                foreach (is_array($handlers) ? $handlers : [] as $handler) {
                    foreach (is_array($handler['methods'] ?? null) ? array_keys(array_filter($handler['methods'])) : [] as $method) {
                        $paths[$path][] = (string) $method;
                    }
                }
            }
        }

        return $paths;
    }

    private function boot(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();

        do_action('rest_api_init', $wp_rest_server);
    }
}
