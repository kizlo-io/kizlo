<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\Introspection\CoreControllers;
use Kizlo\Modules\Introspection\OperationErrors;
use WP_REST_Comments_Controller;
use WP_REST_Server;

/**
 * The WordPress routes Kizlo describes but does not serve.
 *
 * Comments, menus and menu items are core's. Kizlo publishes a contract for them
 * so the generated client can reach them, which makes the contract a claim about
 * someone else's API and the claim worth checking: nothing registers these
 * routes, so nothing would fail if the description drifted from what WordPress
 * actually serves.
 *
 * So the assertions compare the two directly. The described list is compared
 * against `get_collection_params()`, and the described single-item inputs against
 * the arguments core registered its own routes with. A parameter WordPress adds
 * or drops in a later release fails here rather than reaching a caller as a lie.
 */
class CoreRouteTest extends IntrospectionTestCase
{
    private const RESOURCES = [
        'comments'  => '/comments',
        'menus'     => '/menus',
        'menuItems' => '/menu-items',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
        $this->boot();
    }

    // ============================================================
    // THE DESCRIBED SURFACE IS THE SERVED SURFACE
    // ============================================================

    public function test_every_list_parameter_the_comments_controller_honours_is_described(): void
    {
        $this->assertSame(
            $this->honoured((new WP_REST_Comments_Controller())->get_collection_params()),
            $this->described('comments', '/comments', 'list'),
        );
    }

    public function test_every_list_parameter_the_menus_controller_honours_is_described(): void
    {
        $this->assertSame(
            $this->honoured(CoreControllers::forTaxonomy('nav_menu')->get_collection_params()),
            $this->described('menus', '/menus', 'list'),
        );
    }

    public function test_every_list_parameter_the_menu_items_controller_honours_is_described(): void
    {
        $this->assertSame(
            $this->honoured(CoreControllers::forPostType('nav_menu_item')->get_collection_params()),
            $this->described('menuItems', '/menu-items', 'list'),
        );
    }

    /**
     * The single-item reads and the delete take their parameters from the route
     * registration rather than from a collection-params call, so they are compared
     * against the arguments core registered.
     */
    public function test_the_single_item_inputs_match_the_arguments_core_registered(): void
    {
        foreach (self::RESOURCES as $apiId => $base) {
            $single = sprintf('%s/{id}', $base);

            $this->assertSame(
                $this->registered($base . '/(?P<id>[\d]+)', 'GET'),
                $this->described($apiId, $single, 'retrieve'),
                sprintf('%s retrieve', $apiId),
            );

            $this->assertSame(
                $this->registered($base . '/(?P<id>[\d]+)', 'DELETE'),
                $this->described($apiId, $single, 'delete'),
                sprintf('%s delete', $apiId),
            );
        }
    }

    public function test_the_write_inputs_match_the_arguments_core_registered(): void
    {
        foreach (self::RESOURCES as $apiId => $base) {
            $this->assertSame(
                $this->registered($base, 'POST'),
                $this->described($apiId, $base, 'create'),
                sprintf('%s create', $apiId),
            );

            // Core registers one editable handler for POST, PUT and PATCH; Kizlo
            // describes the one method a generated client would send.
            $this->assertSame(
                $this->registered($base . '/(?P<id>[\d]+)', 'PATCH'),
                $this->described($apiId, sprintf('%s/{id}', $base), 'update'),
                sprintf('%s update', $apiId),
            );
        }
    }

    // ============================================================
    // ONE RESPONSE SHAPE PER OPERATION
    // ============================================================

    /**
     * `context` decides which fields a core response carries, so describing it
     * would describe an operation with more than one return type. A managed route
     * pins it before the controller runs; a described route has nothing to pin it
     * with, so it is left undeclared and the response is described in the context
     * WordPress falls back to.
     */
    public function test_no_described_operation_offers_a_context_parameter(): void
    {
        foreach (self::RESOURCES as $apiId => $base) {
            foreach ($this->document()['apis'][$apiId]['paths'] as $path => $operations) {
                foreach ($operations as $name => $operation) {
                    $this->assertArrayNotHasKey(
                        'context',
                        $operation['input']['properties'] ?? [],
                        sprintf('%s %s %s', $apiId, $name, $path),
                    );
                }
            }
        }
    }

    /**
     * `nav_menu_item.title` is `['string', 'object']` in core, because one schema
     * doubles as the write surface. A response only ever carries the object, so
     * the union would publish a branch nothing can return and every reader would
     * narrow past it to reach `title.rendered`.
     */
    public function test_a_response_field_is_described_in_the_shape_it_is_written_in(): void
    {
        $title = $this->document()['schemas']['kizlo.menu-item']['properties']['title'];

        $this->assertArrayNotHasKey('anyOf', $title);
        $this->assertSame('object', $title['type']);
        $this->assertArrayHasKey('rendered', $title['properties']);
        $this->assertArrayNotHasKey('raw', $title['properties']);
    }

    // ============================================================
    // WHAT SITS IN FRONT OF A ROUTE NOBODY HERE SERVES
    // ============================================================

    /**
     * `RestGuard` filters `rest_authentication_errors`, which the server consults
     * once per request rather than once per namespace, so the lockdown is in front
     * of `wp/v2` as much as `kizlo/v1`.
     */
    public function test_a_described_route_inherits_the_guard_errors(): void
    {
        $errors = $this->document()['apis']['comments']['paths']['/comments']['list']['errors'];

        foreach (OperationErrors::GUARD as $code) {
            $this->assertContains($code, $errors);
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

    public function test_every_described_resource_carries_the_five_operations(): void
    {
        foreach (array_keys(self::RESOURCES) as $apiId) {
            $operations = [];

            foreach ($this->document()['apis'][$apiId]['paths'] as $path => $found) {
                foreach ($found as $name => $_) {
                    $operations[] = $name;
                }
            }

            sort($operations);

            $this->assertSame(['create', 'delete', 'list', 'retrieve', 'update'], $operations, $apiId);
        }
    }

    public function test_a_described_list_carries_the_pagination_headers(): void
    {
        foreach (self::RESOURCES as $apiId => $base) {
            $headers = $this->document()['apis'][$apiId]['paths'][$base]['list']['responses']['200']['headers'];

            $this->assertArrayHasKey('X-WP-Total', $headers['properties']);
            $this->assertArrayHasKey('X-WP-TotalPages', $headers['properties']);
        }
    }

    public function test_describing_these_routes_costs_no_diagnostics(): void
    {
        $this->assertSame([], $this->errors());
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * The input property names an operation declares.
     *
     * @return array<int, string>
     */
    private function described(string $apiId, string $path, string $operation): array
    {
        $properties = $this->document()['apis'][$apiId]['paths'][$path][$operation]['input']['properties'] ?? [];

        return $this->sorted(array_keys($properties));
    }

    /**
     * The argument names core registered a route with, minus `context`.
     *
     * @return array<int, string>
     */
    private function registered(string $route, string $method): array
    {
        foreach (rest_get_server()->get_routes()['/wp/v2' . $route] ?? [] as $handler) {
            if (!is_array($handler['methods'] ?? null) || ($handler['methods'][$method] ?? false) !== true) {
                continue;
            }

            return $this->honoured($handler['args'] ?? []);
        }

        $this->fail(sprintf('WordPress registers no %s handler on /wp/v2%s.', $method, $route));
    }

    /**
     * @param array<array-key, mixed> $params
     * @return array<int, string>
     */
    private function honoured(array $params): array
    {
        unset($params['context']);

        /** @var array<int, string> $names */
        $names = array_keys($params);

        return $this->sorted($names);
    }

    /**
     * @param array<int, string> $names
     * @return array<int, string>
     */
    private function sorted(array $names): array
    {
        sort($names);

        return $names;
    }

    private function boot(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();

        do_action('rest_api_init', $wp_rest_server);
    }
}
