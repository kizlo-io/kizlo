<?php

namespace Kizlo\Tests\RestApi;

use Kizlo\Modules\RestApi\RestGuard;
use Kizlo\Tests\Introspection\IntrospectionTestCase;
use WP_REST_Request;
use WP_REST_Server;

/**
 * The permission callback every Kizlo-owned route carries, exercised through a
 * real `PUT /kizlo/v1/settings/site` dispatch.
 *
 * {@see \Kizlo\Modules\Introspection\RouteRegistrar::routeArgs()} is the single
 * place that gates a `/kizlo/*` route: it admits any logged-in administrator
 * regardless of the authentication mechanism (cookie + nonce as well as an
 * Application Password), and returns the same `kizlo_rest_unauthorized` /
 * `kizlo_rest_forbidden` codes the introspection contract advertises. The guard
 * no longer stands in front of these routes at all.
 */
class PermissionCallbackTest extends IntrospectionTestCase
{
    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        // The plugin is booted by the test bootstrap, so the settings routes are
        // already registered; a fresh server just needs the rest_api_init pass a
        // real request would trigger.
        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        do_action('rest_api_init', $this->server);
    }

    public function test_a_cookie_administrator_can_update_settings_without_an_application_password(): void
    {
        $this->actingAsCookieAdmin();

        $response = $this->put(['name' => 'Cookie Admin Site']);

        $this->assertSame(200, $response->get_status());
        $this->assertSame('Cookie Admin Site', $response->get_data()['name']);
    }

    public function test_an_application_password_administrator_can_still_update_settings(): void
    {
        $this->actingAsAdmin();

        $response = $this->put(['name' => 'SDK Site']);

        $this->assertSame(200, $response->get_status());
        $this->assertSame('SDK Site', $response->get_data()['name']);
    }

    public function test_an_anonymous_caller_is_rejected_with_401(): void
    {
        wp_set_current_user(0);

        $response = $this->put(['name' => 'Nope']);

        $this->assertSame(401, $response->get_status());
        $this->assertSame('kizlo_rest_unauthorized', $response->get_data()['code']);
    }

    public function test_a_logged_in_non_administrator_is_rejected_with_403(): void
    {
        wp_set_current_user(self::factory()->user->create(['role' => 'subscriber']));

        $response = $this->put(['name' => 'Nope']);

        $this->assertSame(403, $response->get_status());
        $this->assertSame('kizlo_rest_forbidden', $response->get_data()['code']);
    }

    /**
     * The guard is opt-in and no longer protects a Kizlo route: it defers the
     * dispatch to the route's own permission callback. What keeps the route
     * administrator-only is that callback, proven by the dispatch cases above.
     */
    public function test_the_guard_defers_a_kizlo_route(): void
    {
        wp_set_current_user(0);

        $request = new WP_REST_Request('PUT', '/kizlo/v1/settings/site');

        $this->assertNull((new RestGuard())->requireAdmin(null, null, $request));
    }

    /**
     * @param array<string, mixed> $body
     */
    private function put(array $body): \WP_REST_Response
    {
        $request = new WP_REST_Request('PUT', '/kizlo/v1/settings/site');
        $request->set_header('content-type', 'application/json');
        $request->set_body((string) wp_json_encode($body));

        return $this->server->dispatch($request);
    }
}
