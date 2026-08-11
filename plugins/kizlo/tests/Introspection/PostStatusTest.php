<?php

namespace Kizlo\Tests\Introspection;

use WP_REST_Request;
use WP_REST_Server;
use WP_REST_Posts_Controller;
use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Introspection\ManagedContent;
use Kizlo\Modules\Introspection\ManagedPostTypes;

/**
 * `status` described once and referenced everywhere.
 *
 * Every site that mentions a status used to spell out its own idea of one: the
 * list filter carried an inline enum, and both the write schemas and the response
 * carried a bare `string` that constrained nothing. A client got an anonymous
 * union in one place and no type at all in the other two.
 *
 * There are three vocabularies rather than one because WordPress means three
 * different things by the word. Two of them are core's own and are read off the
 * controller rather than rebuilt: `get_item_schema()` says what may be written,
 * `get_collection_params()` says what may be filtered by. Deciding either here
 * would mean guessing at flags core already passes to `get_post_stati()`.
 *
 * The third is Kizlo's, and it exists because core has no response schema and its
 * item schema is wrong for the job. Collapsing them would either reject a status
 * the API really returns or admit one it will not write.
 *
 * What the write side cost before it was described is the reason this matters:
 * an unknown status was silently stored as `draft`, and `inherit` or `trash` were
 * stored verbatim, both with a 201, on a route where core's own endpoint answers
 * 400.
 */
class PostStatusTest extends IntrospectionTestCase
{
    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
    }

    // ============================================================
    // THE VOCABULARIES
    // ============================================================

    /**
     * Core declares this one, so it is taken rather than rebuilt. Deciding the
     * writable set here would mean guessing at the flags core already passes to
     * `get_post_stati()`, which is the hand-written fork the derivation removed.
     */
    public function test_the_writable_vocabulary_is_the_controller_s_item_schema(): void
    {
        $this->assertSame(
            (new WP_REST_Posts_Controller('post'))->get_item_schema()['properties']['status']['enum'],
            $this->vocabulary(CoreSchemas::POST_STATUS_WRITABLE),
        );
    }

    /** Core declares this one too. */
    public function test_the_filter_vocabulary_is_the_controller_s_collection_param(): void
    {
        $this->assertSame(
            (new WP_REST_Posts_Controller('post'))->get_collection_params()['status']['items']['enum'],
            $this->vocabulary(CoreSchemas::POST_STATUS_FILTER),
        );
    }

    /**
     * The one vocabulary core does not declare. It is the filter set less `any`,
     * so the only thing decided here is dropping a query verb that no post is
     * ever stored with.
     */
    public function test_the_response_vocabulary_is_the_filter_set_without_any(): void
    {
        $enum = $this->vocabulary(CoreSchemas::POST_STATUS);

        $this->assertSame(
            array_values(array_diff($this->vocabulary(CoreSchemas::POST_STATUS_FILTER), ['any'])),
            $enum,
        );

        $this->assertNotContains('any', $enum);
    }

    /**
     * Why the response cannot just reuse core's item schema. Core excludes these
     * two, and Kizlo returns both as a matter of course: the delete route answers
     * with the trashed entry on every call, and every attachment reads back as
     * `inherit`. Adopting core's enum here would publish a contract the API
     * breaks constantly.
     */
    public function test_the_response_vocabulary_admits_what_the_routes_actually_return(): void
    {
        $enum     = $this->vocabulary(CoreSchemas::POST_STATUS);
        $writable = $this->vocabulary(CoreSchemas::POST_STATUS_WRITABLE);

        foreach (['trash', 'inherit'] as $status) {
            $this->assertContains($status, $enum);
            $this->assertNotContains($status, $writable);
        }
    }

    /**
     * A shared schema is only correct while the vocabularies stay global. They do
     * today, because `register_post_status()` takes no post type, but a plugin
     * filtering one type's schema would break the assumption silently, and the
     * fix would be per-type schemas rather than a wider shared one.
     */
    public function test_every_managed_type_reports_the_same_vocabularies(): void
    {
        $writable = $this->vocabulary(CoreSchemas::POST_STATUS_WRITABLE);
        $filter   = $this->vocabulary(CoreSchemas::POST_STATUS_FILTER);

        foreach (array_keys(ManagedPostTypes::managed()) as $slug) {
            $controller = new WP_REST_Posts_Controller($slug);

            $this->assertSame($writable, $controller->get_item_schema()['properties']['status']['enum'], $slug);
            $this->assertSame($filter, $controller->get_collection_params()['status']['items']['enum'], $slug);
        }
    }

    /**
     * Read from `get_post_stati()` at build time rather than listed, on the same
     * terms as the derived list parameters. `register_post_status()` takes no post
     * type, so a status another plugin registers is in the vocabulary for every
     * type. Nothing native separates one type's statuses from another's, and the
     * visibility flags do not help: `internal` defaults to true only when no
     * visibility argument is passed at all, so a plugin passing `'public' => false`
     * lands in the writable vocabulary too.
     *
     * Noise is the accepted cost. WordPress really will write this status onto a
     * post, so describing it is truthful and excluding it would not be.
     */
    public function test_a_status_registered_by_another_plugin_joins_both_vocabularies(): void
    {
        register_post_status('acme-processing', ['public' => false]);

        ManagedContent::flush();

        $this->assertContains('acme-processing', $this->vocabulary(CoreSchemas::POST_STATUS));
        $this->assertContains('acme-processing', $this->vocabulary(CoreSchemas::POST_STATUS_WRITABLE));
    }

    // ============================================================
    // EVERY SITE REFERS RATHER THAN REPEATS
    // ============================================================

    /**
     * @dataProvider referenceProvider
     */
    public function test_a_status_property_is_a_reference(string $schema, string $target): void
    {
        $status = $this->document()['schemas'][$schema]['properties']['status'];

        $this->assertSame($target, $status['$ref']);
        $this->assertArrayNotHasKey('enum', $status, 'A referencing property carries no vocabulary of its own.');
        $this->assertArrayNotHasKey('type', $status);
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function referenceProvider(): array
    {
        return [
            'response'          => [CoreSchemas::POST, CoreSchemas::POST_STATUS],
            'post create'       => ['post-types.post.create-input', CoreSchemas::POST_STATUS_WRITABLE],
            'post update'       => ['post-types.post.update-input', CoreSchemas::POST_STATUS_WRITABLE],
            'page create'       => ['post-types.page.create-input', CoreSchemas::POST_STATUS_WRITABLE],
        ];
    }

    // ============================================================
    // THE DESCRIPTION IS ENFORCED
    // ============================================================

    /**
     * The defect the write vocabulary closes. `handle_status_param()` falls
     * through to `if ( ! get_post_status_object( $status ) ) { $status = 'draft'; }`,
     * so an unknown status was not refused, it was quietly swapped for one the
     * caller never asked for and returned with a 201.
     *
     * @dataProvider unwritableStatusProvider
     */
    public function test_a_status_that_cannot_be_written_is_refused(string $status): void
    {
        $this->boot();

        $response = $this->create($status);

        $this->assertSame(400, $response->get_status(), sprintf('status=%s must not be accepted.', $status));
        $this->assertSame('rest_invalid_param', $response->get_data()['code']);
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function unwritableStatusProvider(): array
    {
        return [
            // Was stored as "draft", silently.
            'unregistered' => ['nonsense'],

            // Were stored verbatim, so the route could create a post directly
            // into the trash, or with the status WordPress reserves for
            // attachments. Core's own endpoint answers 400 for both.
            'inherit'      => ['inherit'],
            'trash'        => ['trash'],
        ];
    }

    public function test_a_writable_status_still_creates(): void
    {
        $this->boot();

        $response = $this->create('draft');

        $this->assertSame(201, $response->get_status());
        $this->assertSame('draft', get_post($response->get_data()['id'])->post_status);
    }

    /**
     * The route now answers the way core's own does, which is the point of
     * describing the vocabulary at all.
     *
     * @dataProvider unwritableStatusProvider
     */
    public function test_the_managed_route_agrees_with_the_core_route(string $status): void
    {
        $this->boot();

        $core = new WP_REST_Request('POST', '/wp/v2/posts');
        $core->set_header('content-type', 'application/json');
        $core->set_body(wp_json_encode(['title' => 'probe', 'status' => $status]));

        $this->assertSame(
            $this->server->dispatch($core)->get_status(),
            $this->create($status)->get_status(),
        );
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * @return array<int, string>
     */
    private function vocabulary(string $schema): array
    {
        return $this->document()['schemas'][$schema]['enum'];
    }

    private function create(string $status): \WP_REST_Response
    {
        $request = new WP_REST_Request('POST', '/kizlo/v1/post-types/post');
        $request->set_header('content-type', 'application/json');
        $request->set_body(wp_json_encode(['title' => 'probe', 'status' => $status]));

        return $this->server->dispatch($request);
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
        $this->server   = $wp_rest_server;

        do_action('rest_api_init', $this->server);
    }
}
