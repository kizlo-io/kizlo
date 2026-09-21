<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\CoreApi\RouteDiscovery;
use Kizlo\Modules\Introspection\OperationErrors;
use Kizlo\Modules\Introspection\PathNormalizer;
use Kizlo\Modules\Settings\Settings;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use WP_REST_Posts_Controller;
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
    private const FIXTURE_NAMESPACE = 'acme/v1';

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

    public function test_the_namespace_filter_receives_the_defaults_and_owns_the_result(): void
    {
        $received = null;
        $replace  = static function (array $namespaces) use (&$received): array {
            $received = $namespaces;
            return [];
        };

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $replace);

        try {
            $apis = $this->document()['apis'];

            $this->assertSame(RouteDiscovery::NAMESPACES, $received);
            $this->assertArrayNotHasKey('posts', $apis);
            $this->assertArrayNotHasKey('directorySizes', $apis);
            $this->assertArrayHasKey('kizlo.comments', $apis);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $replace);
        }
    }

    public function test_a_namespace_can_be_opted_into_route_discovery(): void
    {
        $register = $this->registerFixtureNamespace();
        $include  = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];
        $route    = static function (array $declaration, string $namespace): array {
            if ($namespace === self::FIXTURE_NAMESPACE) {
                $declaration['summary'] = 'Retrieve an opted-in probe';
            }

            return $declaration;
        };
        $schema = static function (array $properties, string $apiId): array {
            if ($apiId === 'probes') {
                $properties['filtered'] = ['type' => 'boolean'];
            }

            return $properties;
        };

        $this->assertArrayNotHasKey('probes', $this->document()['apis']);

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
        add_filter(RouteDiscovery::ROUTE_FILTER, $route, 10, 2);
        add_filter(RouteDiscovery::SCHEMA_FILTER, $schema, 10, 2);

        try {
            $document  = $this->document();
            $api       = $document['apis']['probes'];
            $operation = $api['paths']['/probes/{id}']['retrieve'];
            $ref       = $operation['responses']['200']['body']['$ref'];

            $this->assertSame(self::FIXTURE_NAMESPACE, $api['namespace']);
            $this->assertSame('GET', $operation['method']);
            $this->assertSame('Retrieve an opted-in probe', $operation['summary']);
            $this->assertSame(['in' => 'path', 'type' => 'integer', 'required' => true], $operation['input']['properties']['id']);
            $this->assertSame(['type' => 'boolean'], $document['schemas'][$ref]['properties']['filtered']);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_filter(RouteDiscovery::ROUTE_FILTER, $route);
            remove_filter(RouteDiscovery::SCHEMA_FILTER, $schema);
            remove_action('rest_api_init', $register);
        }
    }

    public function test_duplicate_namespaces_are_discovered_once(): void
    {
        $register = $this->registerFixtureNamespace();
        $include  = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE, self::FIXTURE_NAMESPACE];
        $seen     = 0;
        $count    = static function (array $declaration, string $namespace) use (&$seen): array {
            if ($namespace === self::FIXTURE_NAMESPACE) {
                $seen++;
            }

            return $declaration;
        };

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
        add_filter(RouteDiscovery::ROUTE_FILTER, $count, 10, 2);

        try {
            $this->assertArrayHasKey('probes', $this->document()['apis']);
            $this->assertSame(1, $seen);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_filter(RouteDiscovery::ROUTE_FILTER, $count);
            remove_action('rest_api_init', $register);
        }
    }

    public function test_an_invalid_namespace_filter_result_keeps_the_defaults_and_reports_it(): void
    {
        $invalid = static fn(): string => self::FIXTURE_NAMESPACE;

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $invalid);

        try {
            $document = $this->document();

            $this->assertArrayHasKey('posts', $document['apis']);
            $this->assertErrorContains($document['diagnostics'], 'must return an array of REST namespaces');
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $invalid);
        }
    }

    public function test_invalid_namespace_entries_are_ignored_without_hiding_valid_ones(): void
    {
        $register = $this->registerFixtureNamespace();
        $include  = static fn(array $namespaces): array => [...$namespaces, 'missing-version', 42, self::FIXTURE_NAMESPACE];

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);

        try {
            $document = $this->document();

            $this->assertArrayHasKey('posts', $document['apis']);
            $this->assertArrayHasKey('probes', $document['apis']);
            $this->assertErrorContains($document['diagnostics'], 'invalid REST namespace ("missing-version")');
            $this->assertErrorContains($document['diagnostics'], 'invalid REST namespace (integer)');
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_action('rest_api_init', $register);
        }
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

            $properties = $this->responseProperties($this->document(), 'kizloProbes', '/kizlo-probes/{id}', 'retrieve');
            $this->assertArrayNotHasKey('kizlo', $properties);

            $include = static fn(array $postTypes): array => [...$postTypes, 'kizlo_probe'];
            add_filter('kizlo_included_post_types', $include);

            try {
                Settings::invalidateCache();
                $properties = $this->responseProperties($this->document(), 'kizloProbes', '/kizlo-probes/{id}', 'retrieve');

                $this->assertArrayHasKey('kizlo', $properties);
                $this->assertSame(['custom', 'extend'], $this->sorted(array_keys($properties['kizlo']['properties'])));
            } finally {
                remove_filter('kizlo_included_post_types', $include);
                Settings::invalidateCache();
            }
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

    public function test_included_content_contributes_the_operation_appropriate_envelope(): void
    {
        $document = $this->document();

        foreach ([
            ['posts', '/posts', '/posts/{id}'],
            ['categories', '/categories', '/categories/{id}'],
        ] as [$apiId, $collection, $item]) {
            $list     = $this->responseProperties($document, $apiId, $collection, 'list')['kizlo']['properties'];
            $retrieve = $this->responseProperties($document, $apiId, $item, 'retrieve')['kizlo']['properties'];

            $this->assertSame(['custom', 'extend'], $this->sorted(array_keys($list)), $apiId);
            $this->assertSame(['custom', 'extend', 'seo'], $this->sorted(array_keys($retrieve)), $apiId);

            foreach (['tags', 'author', 'categories', 'featured_image', 'id', 'name', 'slug', 'description', 'parent', 'count', 'url'] as $field) {
                $this->assertArrayNotHasKey($field, $list, $apiId);
                $this->assertArrayNotHasKey($field, $retrieve, $apiId);
            }
        }

        $media = $this->responseProperties($document, 'media', '/media/{id}', 'retrieve')['kizlo']['properties'];
        $this->assertSame(['custom', 'extend'], $this->sorted(array_keys($media)));
    }

    public function test_operation_specific_envelopes_use_distinct_reusable_schemas(): void
    {
        $document = $this->document();
        $paths    = $document['apis']['posts']['paths'];

        $listRef     = $paths['/posts']['list']['responses']['200']['body']['items']['$ref'];
        $createRef   = $paths['/posts']['create']['responses']['201']['body']['$ref'];
        $retrieveRef = $paths['/posts/{id}']['retrieve']['responses']['200']['body']['$ref'];
        $updateRef   = $paths['/posts/{id}']['update']['responses']['200']['body']['$ref'];

        $this->assertSame($listRef, $createRef);
        $this->assertSame($retrieveRef, $updateRef);
        $this->assertNotSame($listRef, $retrieveRef);
        $this->assertArrayHasKey($listRef, $document['schemas']);
        $this->assertArrayHasKey($retrieveRef, $document['schemas']);
    }

    public function test_core_envelopes_describe_configured_and_contributed_custom_fields(): void
    {
        $definitions = FieldDefinitions::normalize([['type' => 'text', 'name' => 'banner']]);
        $this->seedSettings([
            'post_types' => ['page' => ['custom_fields' => $definitions]],
            'taxonomies' => ['category' => ['custom_fields' => $definitions]],
        ]);

        add_filter('kizlo_post_type_custom_schema', static function (array $properties, string $slug): array {
            if ($slug === 'page') $properties['acme'] = ['type' => 'object', 'required' => true];
            return $properties;
        }, 10, 2);
        add_filter('kizlo_taxonomy_custom_schema', static function (array $properties, string $slug): array {
            if ($slug === 'category') $properties['acme'] = ['type' => 'object', 'required' => true];
            return $properties;
        }, 10, 2);

        try {
            $document = $this->document();

            foreach ([
                ['pages', '/pages/{id}'],
                ['categories', '/categories/{id}'],
            ] as [$apiId, $path]) {
                $custom = $this->responseProperties($document, $apiId, $path, 'retrieve')['kizlo']['properties']['custom']['properties'];

                $this->assertSame('string', $custom['banner']['type']);
                $this->assertSame(['type' => 'object', 'required' => true], $custom['acme']);
            }
        } finally {
            remove_all_filters('kizlo_post_type_custom_schema');
            remove_all_filters('kizlo_taxonomy_custom_schema');
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

    public function test_core_controller_families_contribute_their_handler_errors(): void
    {
        $document = $this->document();

        foreach ([
            ['media', '/media', 'create', 'rest_upload_no_data'],
            ['users', '/users', 'create', 'rest_cannot_create_user'],
            ['users.applicationPasswords', '/users/{user_id}/application-passwords', 'list', 'rest_cannot_list_application_passwords'],
            ['settings', '/settings', 'update', 'rest_invalid_stored_value'],
        ] as [$apiId, $path, $operation, $code]) {
            $this->assertContains($code, $document['apis'][$apiId]['paths'][$path][$operation]['errors'], $apiId);
        }
    }

    public function test_custom_content_uses_its_core_controller_family_errors(): void
    {
        register_post_type('kizlo_error_probe', [
            'public'       => true,
            'show_in_rest' => true,
            'rest_base'    => 'kizlo-error-probes',
        ]);
        register_taxonomy('kizlo_error_kind', 'kizlo_error_probe', [
            'public'       => true,
            'show_in_rest' => true,
            'rest_base'    => 'kizlo-error-kinds',
        ]);

        try {
            $this->boot();
            $document = $this->document();

            $this->assertContains(
                'rest_post_invalid_id',
                $document['apis']['kizloErrorProbes']['paths']['/kizlo-error-probes/{id}']['retrieve']['errors'],
            );
            $this->assertContains(
                'rest_term_invalid',
                $document['apis']['kizloErrorKinds']['paths']['/kizlo-error-kinds/{id}']['retrieve']['errors'],
            );
        } finally {
            unregister_taxonomy('kizlo_error_kind');
            unregister_post_type('kizlo_error_probe');
        }
    }

    public function test_an_unknown_controller_family_gets_no_guessed_handler_errors(): void
    {
        $controller = new class extends \WP_REST_Controller {
            public function __construct()
            {
                $this->namespace = 'wp/v2';
                $this->rest_base = 'kizlo-unknown-errors';
            }

            public function register_routes(): void
            {
                register_rest_route($this->namespace, '/' . $this->rest_base, [
                    'methods'             => WP_REST_Server::READABLE,
                    'callback'            => [$this, 'get_items'],
                    'permission_callback' => '__return_true',
                ]);
            }

            public function get_items($request): \WP_REST_Response
            {
                return new \WP_REST_Response([]);
            }

            public function get_item_schema(): array
            {
                return ['type' => 'object', 'properties' => []];
            }
        };

        add_action('rest_api_init', [$controller, 'register_routes']);

        try {
            $this->boot();
            $errors = $this->document()['apis']['kizloUnknownErrors']['paths']['/kizlo-unknown-errors']['list']['errors'];

            $this->assertSame(OperationErrors::NATIVE, $errors);
        } finally {
            remove_action('rest_api_init', [$controller, 'register_routes']);
        }
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

    /**
     * @param array<string, mixed> $document
     * @return array<string, array<string, mixed>>
     */
    private function responseProperties(array $document, string $apiId, string $path, string $operation): array
    {
        $response = $document['apis'][$apiId]['paths'][$path][$operation]['responses'];
        $success  = $response[array_key_first($response)];
        $body     = $success['body'];
        $ref      = $body['$ref'] ?? $body['items']['$ref'];

        return $document['schemas'][$ref]['properties'];
    }

    /** @param string[] $values */
    private function sorted(array $values): array
    {
        sort($values);
        return $values;
    }

    private function boot(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();

        do_action('rest_api_init', $wp_rest_server);
    }

    private function registerFixtureNamespace(): \Closure
    {
        $register = static function (): void {
            $controller = new WP_REST_Posts_Controller('post');

            register_rest_route(self::FIXTURE_NAMESPACE, '/probes/(?P<id>[\d]+)', [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [$controller, 'get_item'],
                'permission_callback' => '__return_true',
                'args'                => [
                    'id' => ['type' => 'integer', 'required' => true],
                ],
            ]);
        };

        add_action('rest_api_init', $register);
        $this->boot();

        return $register;
    }
}
