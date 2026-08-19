<?php

namespace Kizlo\Tests\Introspection;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use Kizlo\Modules\RestApi\RestGuard;

/**
 * `GET /kizlo/v1/introspect`: the auth boundary, the failure payload, and the
 * ETag that lets a generator skip a document it already has.
 */
class IntrospectEndpointTest extends IntrospectionTestCase
{
    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        // The plugin is booted by the test bootstrap, so the route and the version
        // header filter are already registered; a fresh server just needs the
        // rest_api_init pass that a real request would trigger.
        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        do_action('rest_api_init', $this->server);
    }

    /**
     * @param array<string, string> $headers
     */
    private function get(array $headers = []): WP_REST_Response
    {
        $request = new WP_REST_Request('GET', '/kizlo/v1/introspect');

        foreach ($headers as $name => $value) {
            $request->set_header($name, $value);
        }

        return $this->server->dispatch($request);
    }

    // ============================================================
    // AUTH
    // ============================================================

    public function test_the_route_is_registered(): void
    {
        $this->assertArrayHasKey('/kizlo/v1/introspect', $this->server->get_routes());
    }

    public function test_an_unauthenticated_caller_is_rejected_with_401(): void
    {
        wp_set_current_user(0);

        $result = (new RestGuard())->requireAdmin(null);

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame(401, $result->get_error_data()['status']);
    }

    public function test_an_authenticated_non_administrator_is_rejected_with_403(): void
    {
        wp_set_current_user(self::factory()->user->create(['role' => 'editor']));

        $this->assertSame(403, $this->get()->get_status());
        $this->assertSame(403, (new RestGuard())->requireAdmin(null)->get_error_data()['status']);
    }

    public function test_an_administrator_gets_the_document(): void
    {
        $this->actingAsAdmin();

        $response = $this->get();

        $this->assertSame(200, $response->get_status());
        $this->assertSame('1.0', $response->get_data()['version']);
        $this->assertSame(['version', 'hash', 'schemas', 'apis', 'diagnostics'], array_keys($response->get_data()));
    }

    public function test_the_plugin_version_header_is_stamped(): void
    {
        $this->actingAsAdmin();

        // `rest_post_dispatch` is applied by serve_request(), not dispatch(), so the
        // stamping filter is run here the way a served request would run it.
        $response = apply_filters(
            'rest_post_dispatch',
            $this->get(),
            $this->server,
            new WP_REST_Request('GET', '/kizlo/v1/introspect'),
        );

        $this->assertSame(KIZLO_VERSION, $response->get_headers()['X-Kizlo-Version']);
    }

    public function test_no_callback_or_controller_metadata_leaks_into_the_document(): void
    {
        $this->actingAsAdmin();

        $encoded = (string) wp_json_encode($this->get()->get_data());

        foreach (['"callback":', '"permission_callback":', 'Closure', 'WP_REST_Posts_Controller'] as $needle) {
            $this->assertStringNotContainsString($needle, $encoded);
        }
    }

    // ============================================================
    // CACHING
    // ============================================================

    public function test_the_response_carries_an_etag_derived_from_the_hash(): void
    {
        $this->actingAsAdmin();

        $response = $this->get();

        $this->assertSame(sprintf('"%s"', $response->get_data()['hash']), $response->get_headers()['ETag']);
    }

    public function test_a_matching_if_none_match_returns_304(): void
    {
        $this->actingAsAdmin();

        $etag     = $this->get()->get_headers()['ETag'];
        $response = $this->get(['If-None-Match' => $etag]);

        $this->assertSame(304, $response->get_status());
        $this->assertNull($response->get_data());
    }

    public function test_a_stale_if_none_match_returns_the_document(): void
    {
        $this->actingAsAdmin();

        $this->assertSame(200, $this->get(['If-None-Match' => '"sha256:stale"'])->get_status());
    }

    // ============================================================
    // FAILURE
    // ============================================================

    public function test_a_broken_contribution_is_excluded_rather_than_failing_the_request(): void
    {
        $this->actingAsAdmin();

        $this->registerRouteSchema('acme.broken', [
            'type'       => 'object',
            'properties' => ['post' => ['$ref' => 'acme.missing']],
        ]);

        $response = $this->get();
        $data     = $response->get_data();

        $this->assertSame(200, $response->get_status(), 'One bad schema must not cost the caller every other type.');
        $this->assertArrayNotHasKey('acme.broken', $data['schemas']);
        $this->assertArrayHasKey('kizlo.media', $data['schemas']);

        $entry = $this->errorsFor($data['diagnostics'], 'schema_id', 'acme.broken')[0];

        $this->assertSame('error', $entry['type']);
        $this->assertSame('$ref', $entry['data']['keyword']);
        $this->assertStringContainsString('Unknown schema "acme.missing"', $entry['message']);
    }

    public function test_exclusion_cascades_to_whatever_depended_on_it(): void
    {
        $this->actingAsAdmin();

        $this->registerRouteSchema('acme.broken', ['type' => 'object', 'properties' => ['x' => ['$ref' => 'acme.missing']]]);
        $this->registerRouteSchema('acme.dependent', ['type' => 'object', 'properties' => ['b' => ['$ref' => 'acme.broken']]]);

        $data = $this->get()->get_data();

        $this->assertArrayNotHasKey('acme.dependent', $data['schemas'], 'A schema referencing an excluded one has no type either.');
        $this->assertErrorContains(
            $this->errorsFor($data['diagnostics'], 'schema_id', 'acme.dependent'),
            'Unknown schema "acme.broken"',
        );
    }

    public function test_diagnostics_report_every_problem_not_just_the_first(): void
    {
        $this->actingAsAdmin();

        $this->registerRouteSchema('acme.broken', [
            '$extends'   => 'kizlo.postt',
            'type'       => 'object',
            'properties' => [],
        ]);
        $this->registerRouteSpec($this->operation([
            'operation' => 'create',
            'method'    => 'POST',
            'responses' => ['404' => ['body' => ['$ref' => 'kizlo.error']]],
        ]));

        $diagnostics = $this->get()->get_data()['diagnostics'];

        $this->assertErrorContains($diagnostics, 'Unknown parent schema "kizlo.postt"');
        $this->assertErrorContains($diagnostics, 'No 2xx response declared');

        $route = $this->errorsFor($diagnostics, 'api_id', 'acme.widgets')[0];
        $this->assertSame(['type', 'message', 'data'], array_keys($route));
        $this->assertSame(['api_id', 'path', 'operation', 'keyword'], array_keys($route['data']));
        $this->assertSame('/widgets', $route['data']['path']);
        $this->assertSame('create', $route['data']['operation']);
    }

    public function test_an_invalid_standalone_spec_does_not_break_unrelated_apis(): void
    {
        $this->actingAsAdmin();

        kizlo_register_route([
            'route'    => '/healthy',
            'method'   => 'GET',
            'callback' => static fn() => ['ok' => true],
        ]);
        $this->registerRouteSpec($this->operation(['responses' => []]));

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;
        do_action('rest_api_init', $this->server);

        $data = $this->get()->get_data();

        $this->assertArrayNotHasKey('acme.widgets', $data['apis']);
        $this->assertArrayHasKey('post-types.post', $data['apis'], 'Core content is unaffected by a third-party mistake.');
        $this->assertSame(200, $this->server->dispatch(new WP_REST_Request('GET', '/kizlo/v1/healthy'))->get_status());
    }
}
