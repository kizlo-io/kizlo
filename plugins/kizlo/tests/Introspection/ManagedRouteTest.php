<?php

namespace Kizlo\Tests\Introspection;

use WP_REST_Request;
use WP_REST_Server;
use Kizlo\Modules\Introspection\PathNormalizer;

/**
 * The managed content routes enforcing what they describe.
 *
 * These routes used to be registered generically — one
 * `/post-types/(?P<post_type>…)` handler for every type — which meant they could
 * carry no arguments, because supports, hierarchy, connected taxonomies and
 * custom fields all differ per slug. Every constraint in the contract was
 * therefore a description of behaviour that nothing produced. What is asserted
 * here is the opposite: that a request breaking a declared constraint is
 * rejected before the core controller sees it, and that the surface WordPress
 * serves is the surface `/introspect` describes.
 */
class ManagedRouteTest extends IntrospectionTestCase
{
    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
    }

    /** Register everything queued on rest_api_init and take the resulting server. */
    private function boot(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        do_action('rest_api_init', $this->server);
    }

    /**
     * @param array<string, mixed> $query
     */
    private function dispatch(string $method, string $route, array $query = []): \WP_REST_Response
    {
        $request = new WP_REST_Request($method, $route);
        $request->set_query_params($query);

        return $this->server->dispatch($request);
    }

    // ============================================================
    // FORCE
    // ============================================================

    /**
     * The reason this issue was urgent. Core reads the flag as
     * `(bool) $request['force']`, and the only falsy strings in PHP are "" and
     * "0" — so an unvalidated `force=false` permanently deleted the entry, and
     * `false` is the documented default a careful client would send explicitly.
     *
     * @dataProvider falsyForceProvider
     */
    public function test_a_falsy_force_trashes_a_post_rather_than_deleting_it(?string $force): void
    {
        $this->boot();

        $id = self::factory()->post->create(['post_type' => 'post']);

        $this->dispatch('DELETE', '/kizlo/v1/post-types/post/' . $id, $force === null ? [] : ['force' => $force]);

        $post = get_post($id);

        $this->assertNotNull($post, sprintf('force=%s must not delete permanently.', var_export($force, true)));
        $this->assertSame('trash', $post->post_status);
    }

    /**
     * @return array<string, array<int, string|null>>
     */
    public static function falsyForceProvider(): array
    {
        return [
            'absent'  => [null],
            '"false"' => ['false'],
            '"0"'     => ['0'],
        ];
    }

    /**
     * @dataProvider truthyForceProvider
     */
    public function test_a_truthy_force_deletes_a_post_permanently(string $force): void
    {
        $this->boot();

        $id = self::factory()->post->create(['post_type' => 'post']);

        $this->dispatch('DELETE', '/kizlo/v1/post-types/post/' . $id, ['force' => $force]);

        $this->assertNull(get_post($id), sprintf('force=%s must delete permanently.', $force));
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function truthyForceProvider(): array
    {
        return [
            '"true"' => ['true'],
            '"1"'    => ['1'],
        ];
    }

    /**
     * Terms are the worse half of the same bug: they cannot be trashed at all, so
     * core refuses anything falsy rather than falling back to a trash. An
     * unvalidated "false" skipped that refusal and destroyed the term.
     *
     * @dataProvider falsyForceProvider
     */
    public function test_a_falsy_force_is_refused_for_a_term(?string $force): void
    {
        $this->boot();

        $id = self::factory()->term->create(['taxonomy' => 'category']);

        $response = $this->dispatch('DELETE', '/kizlo/v1/taxonomies/category/' . $id, $force === null ? [] : ['force' => $force]);

        $this->assertSame(501, $response->get_status());
        $this->assertSame('rest_trash_not_supported', $response->get_data()['code']);
        $this->assertInstanceOf(\WP_Term::class, get_term($id, 'category'));
    }

    public function test_a_truthy_force_deletes_a_term(): void
    {
        $this->boot();

        $id = self::factory()->term->create(['taxonomy' => 'category']);

        $response = $this->dispatch('DELETE', '/kizlo/v1/taxonomies/category/' . $id, ['force' => 'true']);

        $this->assertSame(200, $response->get_status());
        $this->assertNull(get_term($id, 'category'));
    }

    // ============================================================
    // DECLARED CONSTRAINTS
    // ============================================================

    public function test_per_page_above_the_declared_maximum_is_rejected(): void
    {
        // Declared `maximum: 100`. Sanitizing an integer does not clamp it, so
        // without validation this reached WP_Query as-is.
        $this->boot();

        $response = $this->dispatch('GET', '/kizlo/v1/post-types/post', ['per_page' => '5000']);

        $this->assertSame(400, $response->get_status());
        $this->assertSame('rest_invalid_param', $response->get_data()['code']);
    }

    public function test_a_value_outside_a_declared_enum_is_rejected(): void
    {
        $this->boot();

        $response = $this->dispatch('GET', '/kizlo/v1/post-types/post', ['order' => 'sideways']);

        $this->assertSame(400, $response->get_status());
        $this->assertSame('rest_invalid_param', $response->get_data()['code']);
    }

    public function test_a_taxonomy_list_enforces_its_declared_constraints_too(): void
    {
        $this->boot();

        $this->assertSame(400, $this->dispatch('GET', '/kizlo/v1/taxonomies/category', ['per_page' => '5000'])->get_status());
        $this->assertSame(400, $this->dispatch('GET', '/kizlo/v1/taxonomies/category', ['orderby' => 'nonsense'])->get_status());
    }

    public function test_declared_defaults_reach_the_controller(): void
    {
        // The terms controller builds its `number` and `offset` straight from
        // per_page and page, so it used to need TaxonomyApi to copy the defaults
        // across by hand before it could list anything at all.
        $this->boot();

        self::factory()->term->create_many(3, ['taxonomy' => 'category']);

        $response = $this->dispatch('GET', '/kizlo/v1/taxonomies/category');

        $this->assertSame(200, $response->get_status());
        $this->assertNotEmpty($response->get_data());
    }

    public function test_a_valid_request_still_reaches_the_controller(): void
    {
        $this->boot();

        self::factory()->post->create_many(2, ['post_type' => 'post', 'post_status' => 'publish']);

        $response = $this->dispatch('GET', '/kizlo/v1/post-types/post', ['per_page' => '2', 'order' => 'asc']);

        $this->assertSame(200, $response->get_status());
        $this->assertCount(2, $response->get_data());
    }

    // ============================================================
    // THE SERVED SURFACE IS THE DESCRIBED SURFACE
    // ============================================================

    public function test_every_described_managed_path_is_registered_with_the_same_methods(): void
    {
        $this->boot();

        $this->assertSame($this->describedRoutes(), $this->registeredManagedRoutes());
    }

    public function test_the_generic_route_no_longer_exists(): void
    {
        // It is what made the contract undeliverable: one registered route cannot
        // carry per-slug arguments.
        $this->boot();

        foreach (array_keys($this->server->get_routes(KIZLO_API_NAMESPACE)) as $route) {
            $this->assertStringNotContainsString('(?P<post_type>', $route);
            $this->assertStringNotContainsString('(?P<taxonomy>', $route);
        }
    }

    public function test_a_post_type_with_api_access_switched_off_is_not_served(): void
    {
        // Previously the toggle only removed the type from the contract; the
        // generic route went on serving it.
        $this->seedSettings(['post_types' => ['page' => ['rest_api_enabled' => false]]]);
        $this->boot();

        $this->assertArrayNotHasKey('/kizlo/v1/post-types/page', $this->server->get_routes());
        $this->assertArrayHasKey('/kizlo/v1/post-types/post', $this->server->get_routes());
    }

    public function test_a_taxonomy_with_api_access_switched_off_is_not_served(): void
    {
        $this->seedSettings(['taxonomies' => ['post_tag' => ['rest_api_enabled' => false]]]);
        $this->boot();

        $this->assertArrayNotHasKey('/kizlo/v1/taxonomies/post_tag', $this->server->get_routes());
        $this->assertArrayHasKey('/kizlo/v1/taxonomies/category', $this->server->get_routes());
    }

    public function test_an_upload_type_is_writable_like_any_other(): void
    {
        // The collection was GET-only, because the route was served through a
        // controller that ignores $_FILES and a create there would have made a row
        // with no file. The controller reads uploads now, so the operations that
        // were withheld are registered like any other type's.
        $this->boot();

        $routes = $this->server->get_routes();

        $this->assertSame(['GET', 'POST'], $this->methodsOf($routes['/kizlo/v1/post-types/attachment']));
        $this->assertContains('PATCH', $this->methodsOf($routes['/kizlo/v1/post-types/attachment/(?P<identifier>[a-zA-Z0-9_.%+-]+)']));
    }

    public function test_an_identifier_may_still_be_a_slug(): void
    {
        // `identifier` is declared as a string precisely so this keeps working;
        // narrowing it to an integer would have broken slug lookups.
        $this->boot();

        $id = self::factory()->post->create(['post_type' => 'post', 'post_name' => 'hello-there', 'post_status' => 'publish']);

        $response = $this->dispatch('GET', '/kizlo/v1/post-types/post/hello-there');

        $this->assertSame(200, $response->get_status());
        $this->assertSame($id, $response->get_data()['id']);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * Managed paths as `/introspect` describes them, path => sorted methods.
     *
     * @return array<string, array<int, string>>
     */
    private function describedRoutes(): array
    {
        $described = [];

        foreach ($this->document()['apis'] as $apiId => $api) {
            if (!str_starts_with((string) $apiId, 'post-types.') && !str_starts_with((string) $apiId, 'taxonomies.')) {
                continue;
            }

            foreach ($api['paths'] as $path => $operations) {
                foreach ($operations as $operation) {
                    $described[$path][] = $operation['method'];
                }
            }
        }

        return $this->tidy($described);
    }

    /**
     * The same thing as WordPress actually serves it, with the namespace and the
     * regex taken back off so the two are comparable.
     *
     * @return array<string, array<int, string>>
     */
    private function registeredManagedRoutes(): array
    {
        $registered = [];

        foreach ($this->server->get_routes() as $route => $handlers) {
            $path = (string) preg_replace('#^/' . preg_quote(KIZLO_API_NAMESPACE, '#') . '#', '', $route);

            if (!str_starts_with($path, '/post-types/') && !str_starts_with($path, '/taxonomies/')) {
                continue;
            }

            $registered[PathNormalizer::normalize($path)['path']] = $this->methodsOf($handlers);
        }

        return $this->tidy($registered);
    }

    /**
     * @param array<int, array<string, mixed>> $handlers
     * @return array<int, string>
     */
    private function methodsOf(array $handlers): array
    {
        $methods = [];

        foreach ($handlers as $handler) {
            foreach (array_keys($handler['methods']) as $method) {
                $methods[] = (string) $method;
            }
        }

        sort($methods);

        return array_values(array_unique($methods));
    }

    /**
     * @param array<string, array<int, string>> $routes
     * @return array<string, array<int, string>>
     */
    private function tidy(array $routes): array
    {
        foreach ($routes as $path => $methods) {
            sort($methods);
            $routes[$path] = array_values(array_unique($methods));
        }

        ksort($routes);

        return $routes;
    }
}
