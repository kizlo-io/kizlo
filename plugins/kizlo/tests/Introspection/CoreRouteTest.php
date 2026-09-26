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

    /** A second namespace from the same vendor, serving the same path. */
    private const FIXTURE_STORE_NAMESPACE = 'acme/store/v1';

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
            // A path capture is in `params` rather than marked, which is what says it is one.
            $this->assertSame(['type' => 'integer', 'required' => true], $operation['input']['params']['properties']['id']);
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

    // ============================================================
    // A NAMESPACE NAMES ITS OWN ROUTES
    // ============================================================

    /**
     * An API ID is every literal in the path, which is what makes it stable and
     * also what makes two namespaces serving `/probes` want one name. The prefix
     * is how a namespace says which `/probes` it means.
     */
    public function test_a_namespace_can_name_its_own_apis(): void
    {
        $register = $this->registerFixtureNamespace();
        $include  = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];
        $prefix   = static fn(string $prefix, string $namespace): string
            => $namespace === self::FIXTURE_NAMESPACE ? 'acme' : $prefix;

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
        add_filter(RouteDiscovery::PREFIX_FILTER, $prefix, 10, 2);

        try {
            $document = $this->document();

            $this->assertArrayHasKey('acme.probes', $document['apis']);
            $this->assertArrayNotHasKey('probes', $document['apis']);

            // A namespace naming itself says nothing about anyone else, so the
            // unprefixed core surface is exactly where it was.
            $this->assertArrayHasKey('posts', $document['apis']);

            // The schema is named after the API rather than buried under `wp.`,
            // because the prefix already qualified it.
            $ref = $document['apis']['acme.probes']['paths']['/probes/{id}']['retrieve']['responses']['200']['body']['$ref'];
            $this->assertSame('acme.probes', $ref);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_filter(RouteDiscovery::PREFIX_FILTER, $prefix);
            remove_action('rest_api_init', $register);
        }
    }

    public function test_two_namespaces_can_describe_the_same_path(): void
    {
        $first  = $this->registerFixtureNamespace();
        $second = $this->registerFixtureNamespace(self::FIXTURE_STORE_NAMESPACE, 'page');

        $include = static fn(array $namespaces): array
            => [...$namespaces, self::FIXTURE_NAMESPACE, self::FIXTURE_STORE_NAMESPACE];

        $prefix = static fn(string $prefix, string $namespace): string => match ($namespace) {
            self::FIXTURE_NAMESPACE       => 'acme',
            self::FIXTURE_STORE_NAMESPACE => 'acme.store',
            default                       => $prefix,
        };

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
        add_filter(RouteDiscovery::PREFIX_FILTER, $prefix, 10, 2);

        try {
            $document = $this->document();

            $this->assertSame(self::FIXTURE_NAMESPACE, $document['apis']['acme.probes']['namespace']);
            $this->assertSame(self::FIXTURE_STORE_NAMESPACE, $document['apis']['acme.store.probes']['namespace']);

            $firstRef = $document['apis']['acme.probes']['paths']['/probes/{id}']['retrieve']['responses']['200']['body']['$ref'];
            $storeRef = $document['apis']['acme.store.probes']['paths']['/probes/{id}']['retrieve']['responses']['200']['body']['$ref'];

            $this->assertSame('acme.probes', $firstRef);
            $this->assertSame('acme.store.probes', $storeRef);
            $this->assertArrayHasKey('sticky', $document['schemas'][$firstRef]['properties']);
            $this->assertArrayNotHasKey('parent', $document['schemas'][$firstRef]['properties']);
            $this->assertArrayHasKey('parent', $document['schemas'][$storeRef]['properties']);
            $this->assertArrayNotHasKey('sticky', $document['schemas'][$storeRef]['properties']);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_filter(RouteDiscovery::PREFIX_FILTER, $prefix);
            remove_action('rest_api_init', $first);
            remove_action('rest_api_init', $second);
        }
    }

    /** Why the prefix exists: unprefixed, the second namespace loses its API. */
    public function test_two_namespaces_sharing_a_path_collide_without_a_prefix(): void
    {
        $first  = $this->registerFixtureNamespace();
        $second = $this->registerFixtureNamespace(self::FIXTURE_STORE_NAMESPACE);

        $include = static fn(array $namespaces): array
            => [...$namespaces, self::FIXTURE_NAMESPACE, self::FIXTURE_STORE_NAMESPACE];

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);

        try {
            $this->assertErrorContains($this->document()['diagnostics'], 'one API has one namespace');
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_action('rest_api_init', $first);
            remove_action('rest_api_init', $second);
        }
    }

    public function test_an_invalid_api_prefix_is_ignored_and_reported(): void
    {
        $register = $this->registerFixtureNamespace();
        $include  = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];
        $prefix   = static fn(string $prefix, string $namespace): string
            => $namespace === self::FIXTURE_NAMESPACE ? 'not a prefix' : $prefix;

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
        add_filter(RouteDiscovery::PREFIX_FILTER, $prefix, 10, 2);

        try {
            $document = $this->document();

            $this->assertArrayHasKey('probes', $document['apis']);
            $this->assertErrorContains($document['diagnostics'], 'invalid API ID prefix ("not a prefix")');
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_filter(RouteDiscovery::PREFIX_FILTER, $prefix);
            remove_action('rest_api_init', $register);
        }
    }

    // ============================================================
    // A ROUTE NO CONTROLLER SERVES
    // ============================================================

    /**
     * `get_item_schema()` is the only response shape this can read unaided, and
     * a route object of somebody else's design has no such method. Whoever
     * registered it does know how to read it, so they are asked.
     */
    public function test_a_route_without_a_controller_is_described_from_the_response_filter(): void
    {
        $register = $this->registerSubjectRoute();
        $include  = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];
        $response = static function (mixed $properties, ?object $subject, string $namespace, string $route): mixed {
            if ($route !== '/gadgets') {
                return $properties;
            }

            return ['ok' => ['type' => 'boolean', 'required' => true]];
        };

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
        add_filter(RouteDiscovery::RESPONSE_FILTER, $response, 10, 4);

        try {
            $document = $this->document();
            $ref      = $document['apis']['gadgets']['paths']['/gadgets']['list']['responses']['200']['body']['items']['$ref'];

            $this->assertSame(['type' => 'boolean', 'required' => true], $document['schemas'][$ref]['properties']['ok']);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_filter(RouteDiscovery::RESPONSE_FILTER, $response);
            remove_action('rest_api_init', $register);
        }
    }

    /** A callable wrapper does not hide the controller it is bound to. */
    public function test_a_closure_bound_to_a_controller_uses_the_controller_schema(): void
    {
        $controller = new WP_REST_Posts_Controller('post');
        $callback   = \Closure::fromCallable([$controller, 'get_item']);
        $register   = static function () use ($callback): void {
            register_rest_route(self::FIXTURE_NAMESPACE, '/bound-probes/(?P<id>[\d]+)', [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => $callback,
                'permission_callback' => '__return_true',
                'args'                => ['id' => ['type' => 'integer', 'required' => true]],
            ]);
        };
        $include = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];

        add_action('rest_api_init', $register);
        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
        $this->boot();

        try {
            $properties = $this->responseProperties($this->document(), 'boundProbes', '/bound-probes/{id}', 'retrieve');

            $this->assertArrayHasKey('id', $properties);
            $this->assertArrayHasKey('title', $properties);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_action('rest_api_init', $register);
        }
    }

    /**
     * Unanswered, the route is still described. A caller can reach it and read
     * the body itself, which is more than it could do when the route was dropped.
     */
    public function test_a_route_nothing_describes_is_described_opaquely(): void
    {
        $register = $this->registerSubjectRoute();
        $include  = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);

        try {
            $document = $this->document();
            $list     = $document['apis']['gadgets']['paths']['/gadgets']['list'];

            // A collection of undescribed records is still a collection: the
            // record is opaque, the array around it is not.
            $this->assertSame(
                ['type' => 'array', 'items' => ['type' => 'object', 'additionalProperties' => true]],
                $list['responses']['200']['body'],
            );
            $this->assertErrorContains($document['diagnostics'], 'described as an opaque object');
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_action('rest_api_init', $register);
        }
    }

    /**
     * A controller can publish nothing to read: no schema of its own, or one
     * whose every property is filtered out of this context. That is an unknown
     * shape rather than a shape with no fields, so it has to reach the same
     * opaque fallback the filter path reaches.
     *
     * Two of them matter together. An empty property set hashes to one
     * fingerprint, so a schema minted for either would be borrowed by the other
     * and each would answer as the unrelated record that claimed the ID first.
     */
    public function test_a_controller_that_publishes_no_properties_is_described_opaquely(): void
    {
        $register = static function (): void {
            $bare = new class () extends \WP_REST_Controller {
                /** @return array<string, mixed> */
                public function get_item_schema(): array
                {
                    return ['title' => 'bare', 'type' => 'object', 'properties' => []];
                }

                public function get_items($request): \WP_REST_Response
                {
                    return new \WP_REST_Response([]);
                }
            };

            foreach (['/bare-probes', '/other-bare-probes'] as $path) {
                register_rest_route(self::FIXTURE_NAMESPACE, $path, [
                    'methods'             => WP_REST_Server::READABLE,
                    'callback'            => [$bare, 'get_items'],
                    'permission_callback' => '__return_true',
                ]);
            }
        };
        $include = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];

        add_action('rest_api_init', $register);
        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
        $this->boot();

        try {
            $document = $this->document();

            foreach (['bareProbes' => '/bare-probes', 'otherBareProbes' => '/other-bare-probes'] as $apiId => $path) {
                $body = $document['apis'][$apiId]['paths'][$path]['list']['responses']['200']['body'];

                $this->assertSame(
                    ['type' => 'array', 'items' => ['type' => 'object', 'additionalProperties' => true]],
                    $body,
                    sprintf('%s was given a shape it does not publish.', $path),
                );
            }

            $this->assertSame([], $this->emptySchemas($document), 'Schemas published with no properties.');
            $this->assertErrorContains($document['diagnostics'], 'described as an opaque object');
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_action('rest_api_init', $register);
        }
    }

    /**
     * The other half of the same rule: a shape that does have properties is
     * still shared between the registrations that derive it, which is what the
     * fingerprint is for and what keeps a large record from being doubled.
     */
    public function test_two_routes_deriving_one_shape_share_its_schema(): void
    {
        $register = static function (): void {
            $controller = new WP_REST_Posts_Controller('post');

            foreach (['/shape-probes', '/twin-shape-probes'] as $path) {
                register_rest_route(self::FIXTURE_NAMESPACE, $path, [
                    'methods'             => WP_REST_Server::READABLE,
                    'callback'            => [$controller, 'get_items'],
                    'permission_callback' => '__return_true',
                ]);
            }
        };
        $include = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];

        add_action('rest_api_init', $register);
        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
        $this->boot();

        try {
            $document = $this->document();
            $refs     = [];

            foreach (['shapeProbes' => '/shape-probes', 'twinShapeProbes' => '/twin-shape-probes'] as $apiId => $path) {
                $refs[] = $document['apis'][$apiId]['paths'][$path]['list']['responses']['200']['body']['items']['$ref'];
            }

            $this->assertSame($refs[0], $refs[1], 'One derived shape was published as two schemas.');
            $this->assertNotSame([], $document['schemas'][$refs[0]]['properties']);
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

        $this->assertSame('string', $this->inputProperties($type)['type']['type']);
        $this->assertTrue($this->inputProperties($type)['type']['required']);
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

        $this->assertArrayHasKey('parent', $this->inputProperties($revision));
        $this->assertArrayHasKey('id', $this->inputProperties($revision));
    }

    /** The attachments controller reads `$_FILES`, so its create is not JSON. */
    public function test_an_upload_create_declares_multipart(): void
    {
        $create = $this->document()['apis']['media']['paths']['/media']['create'];

        $this->assertSame('multipart/form-data', $this->inputContentType($create));
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
        $this->assertArrayHasKey('post_id', $this->inputProperties($apis['kizlo.comments']['paths']['/comments']['create']));
        $this->assertArrayHasKey('post', $this->inputProperties($apis['comments']['paths']['/comments']['create']));
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
    // ONE HANDLER IS ONE OPERATION
    // ============================================================

    /**
     * An editable handler is one callback, so it is one behaviour however many
     * verbs reach it. Named by method instead, its POST reads as a create, and
     * a caller adding one gadget would replace every gadget there is.
     */
    public function test_one_editable_handler_publishes_one_operation(): void
    {
        $register = $this->registerWriteRoute(['editable' => WP_REST_Server::EDITABLE]);
        $include  = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);

        try {
            $operations = $this->document()['apis']['gadgets']['paths']['/gadgets'];

            $this->assertSame(['update'], array_keys($operations));
            $this->assertSame('PATCH', $operations['update']['method']);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_action('rest_api_init', $register);
        }
    }

    /**
     * Two entries are two callbacks and genuinely two behaviours, which is how
     * the Store API registers its checkout.
     */
    public function test_two_handler_entries_publish_two_operations(): void
    {
        $register = $this->registerWriteRoute([
            'creatable' => WP_REST_Server::CREATABLE,
            'editable'  => WP_REST_Server::EDITABLE,
        ]);
        $include = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);

        try {
            $operations = $this->document()['apis']['gadgets']['paths']['/gadgets'];

            $this->assertSame(['create', 'update'], $this->sorted(array_keys($operations)));
            $this->assertSame('POST', $operations['create']['method']);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_action('rest_api_init', $register);
        }
    }

    /** A handler that registers one write verb still says what that verb does. */
    public function test_a_single_write_verb_keeps_its_own_operation(): void
    {
        $register = $this->registerWriteRoute(['creatable' => WP_REST_Server::CREATABLE]);
        $include  = static fn(array $namespaces): array => [...$namespaces, self::FIXTURE_NAMESPACE];

        add_filter(RouteDiscovery::NAMESPACE_FILTER, $include);

        try {
            $operations = $this->document()['apis']['gadgets']['paths']['/gadgets'];

            $this->assertSame(['create'], array_keys($operations));
            $this->assertSame('POST', $operations['create']['method']);
        } finally {
            remove_filter(RouteDiscovery::NAMESPACE_FILTER, $include);
            remove_action('rest_api_init', $register);
        }
    }

    /**
     * A callback core's own controllers use says what the route does, so the
     * verbs it registers are never regrouped: `/wp/v2/settings` is one editable
     * `update_item` and stays one update, exactly as it reads today.
     */
    public function test_a_recognized_callback_is_left_alone(): void
    {
        $operations = $this->document()['apis']['settings']['paths']['/settings'];

        $this->assertSame(['retrieve', 'update'], $this->sorted(array_keys($operations)));
        $this->assertSame('PATCH', $operations['update']['method']);
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

    /**
     * Schema IDs published with no properties at all.
     *
     * @param array<string, mixed> $document
     * @return array<int, string>
     */
    private function emptySchemas(array $document): array
    {
        return array_keys(array_filter(
            $document['schemas'],
            static fn(array $schema): bool => ($schema['properties'] ?? null) === [],
        ));
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

    /**
     * A route served by an object that is not a `WP_REST_Controller`, which is
     * what the WooCommerce Store API registers and what core's derivation cannot
     * read on its own.
     */
    private function registerSubjectRoute(): \Closure
    {
        $register = static function (): void {
            $subject = new class () {
                public function handle(): \WP_REST_Response
                {
                    return new \WP_REST_Response(['ok' => true]);
                }
            };

            register_rest_route(self::FIXTURE_NAMESPACE, '/gadgets', [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [$subject, 'handle'],
                'permission_callback' => '__return_true',
            ]);
        };

        add_action('rest_api_init', $register);
        $this->boot();

        return $register;
    }

    /**
     * A write route served by an object core does not recognise, registered as
     * one handler entry per given method group.
     *
     * @param array<string, string> $entries
     */
    private function registerWriteRoute(array $entries): \Closure
    {
        $register = static function () use ($entries): void {
            $subject = new class () {
                public function handle(): \WP_REST_Response
                {
                    return new \WP_REST_Response(['ok' => true]);
                }
            };

            register_rest_route(self::FIXTURE_NAMESPACE, '/gadgets', array_values(array_map(
                static fn(string $methods): array => [
                    'methods'             => $methods,
                    'callback'            => [$subject, 'handle'],
                    'permission_callback' => '__return_true',
                ],
                $entries,
            )));
        };

        add_action('rest_api_init', $register);
        $this->boot();

        return $register;
    }

    private function registerFixtureNamespace(string $namespace = self::FIXTURE_NAMESPACE, string $postType = 'post'): \Closure
    {
        $register = static function () use ($namespace, $postType): void {
            $controller = new WP_REST_Posts_Controller($postType);

            register_rest_route($namespace, '/probes/(?P<id>[\d]+)', [
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
