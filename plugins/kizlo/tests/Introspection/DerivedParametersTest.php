<?php

namespace Kizlo\Tests\Introspection;

use WP_REST_Request;
use WP_REST_Server;
use WP_REST_Posts_Controller;
use WP_REST_Terms_Controller;

/**
 * The managed list contract being derived rather than written out.
 *
 * The parameters a managed list honours come from `get_collection_params()` on
 * the controller that serves it. Describing the same surface by hand meant two
 * lists nothing reconciled, and the hand-written one fell behind silently: seven
 * parameters were honoured and undescribed, and `orderby=menu_order` was
 * described so narrowly that core's own value was rejected.
 *
 * What is asserted here is that the two lists are now the same list. The first
 * test is the one that matters: it compares the described surface against the
 * controller's own, so the fork cannot reopen without a failure.
 */
class DerivedParametersTest extends IntrospectionTestCase
{
    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
    }

    // ============================================================
    // THE DESCRIBED SURFACE IS THE HONOURED SURFACE
    // ============================================================

    public function test_every_parameter_the_posts_controller_honours_is_described(): void
    {
        $this->assertSame(
            $this->sorted(array_keys((new WP_REST_Posts_Controller('post'))->get_collection_params())),
            $this->sorted(array_keys($this->listProperties('post-types.post', '/post-types/post'))),
        );
    }

    public function test_every_parameter_the_terms_controller_honours_is_described(): void
    {
        $this->assertSame(
            $this->sorted(array_keys((new WP_REST_Terms_Controller('category'))->get_collection_params())),
            $this->sorted(array_keys($this->listProperties('taxonomies.category', '/taxonomies/category'))),
        );
    }

    /**
     * The derivation is per slug, so a type that carries fewer parameters is
     * described with fewer. `page` has no post formats and no sticky flag; it does
     * have page attributes, which is where `menu_order` comes from.
     */
    public function test_the_described_surface_follows_the_post_type(): void
    {
        $this->assertSame(
            $this->sorted(array_keys((new WP_REST_Posts_Controller('page'))->get_collection_params())),
            $this->sorted(array_keys($this->listProperties('post-types.page', '/post-types/page'))),
        );
    }

    // ============================================================
    // THE PARAMETERS THAT WERE MISSING
    // ============================================================

    /**
     * @dataProvider previouslyUndescribedProvider
     */
    public function test_a_previously_undescribed_parameter_is_now_described(string $apiId, string $path, string $parameter): void
    {
        $this->assertArrayHasKey($parameter, $this->listProperties($apiId, $path));
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function previouslyUndescribedProvider(): array
    {
        return [
            'tax_relation'   => ['post-types.post', '/post-types/post', 'tax_relation'],
            'search_columns' => ['post-types.post', '/post-types/post', 'search_columns'],
            'search_semantics' => ['post-types.post', '/post-types/post', 'search_semantics'],
            'ignore_sticky'  => ['post-types.post', '/post-types/post', 'ignore_sticky'],
            'menu_order'     => ['post-types.page', '/post-types/page', 'menu_order'],

            // Core registers these for attachments as well as hierarchical types.
            // Kizlo gated them on hierarchy alone, so "media attached to post N"
            // was unreachable through the contract.
            'attachment parent'         => ['post-types.attachment', '/post-types/attachment', 'parent'],
            'attachment parent_exclude' => ['post-types.attachment', '/post-types/attachment', 'parent_exclude'],
        ];
    }

    /**
     * The issue's acceptance criterion. `tax_relation` reaches `prepare_tax_query()`
     * through `$request['tax_relation']` directly, without even the `$registered`
     * gate the other parameters go through, so declaring route arguments did
     * nothing about it.
     */
    public function test_tax_relation_is_described_and_enforced(): void
    {
        $this->boot();

        $this->assertArrayHasKey('tax_relation', $this->listProperties('post-types.post', '/post-types/post'));

        $this->assertSame(200, $this->dispatch('GET', '/kizlo/v1/post-types/post', ['tax_relation' => 'OR'])->get_status());

        // Previously any value at all was accepted in silence.
        $rejected = $this->dispatch('GET', '/kizlo/v1/post-types/post', ['tax_relation' => 'sideways']);

        $this->assertSame(400, $rejected->get_status());
        $this->assertSame('rest_invalid_param', $rejected->get_data()['code']);
    }

    /**
     * The defect running the other way. Core adds `menu_order` to the orderby enum
     * for page-attributes types, and the hand-written enum omitted it, so enforcing
     * the declaration turned a working sort into a 400.
     */
    public function test_ordering_pages_by_menu_order_is_accepted(): void
    {
        $this->boot();

        $response = $this->dispatch('GET', '/kizlo/v1/post-types/page', ['orderby' => 'menu_order']);

        $this->assertSame(200, $response->get_status());
    }

    public function test_searching_a_single_column_is_accepted(): void
    {
        $this->boot();

        self::factory()->post->create(['post_type' => 'post', 'post_title' => 'findable', 'post_status' => 'publish']);

        $response = $this->dispatch('GET', '/kizlo/v1/post-types/post', [
            'search'         => 'findable',
            'search_columns' => ['post_title'],
        ]);

        $this->assertSame(200, $response->get_status());
        $this->assertCount(1, $response->get_data());
    }

    // ============================================================
    // SHAPES KIZLO SPELLS DIFFERENTLY
    // ============================================================

    /**
     * Core declares a taxonomy filter as `type: ['object', 'array']` beside a
     * `oneOf` naming both shapes. Kizlo has no array-valued `type`, so the list is
     * dropped and the union carries the meaning. Both request forms survive, which
     * is the point: the simple one was all the contract used to admit.
     */
    public function test_a_taxonomy_filter_describes_both_of_its_forms(): void
    {
        $categories = $this->listProperties('post-types.post', '/post-types/post')['categories'];

        $this->assertArrayNotHasKey('type', $categories, 'A union schema carries no sibling type.');
        $this->assertArrayHasKey('oneOf', $categories);

        $types = array_column($categories['oneOf'], 'type');
        sort($types);

        $this->assertSame(['array', 'object'], $types);

        $advanced = $categories['oneOf'][array_search('object', array_column($categories['oneOf'], 'type'), true)];

        $this->assertArrayHasKey('terms', $advanced['properties']);
        $this->assertArrayHasKey('include_children', $advanced['properties']);
        $this->assertArrayHasKey('operator', $advanced['properties']);
    }

    public function test_both_taxonomy_filter_forms_reach_the_controller(): void
    {
        $this->boot();

        $term = self::factory()->term->create(['taxonomy' => 'category']);
        $post = self::factory()->post->create(['post_type' => 'post', 'post_status' => 'publish']);

        wp_set_object_terms($post, [$term], 'category');

        $simple = $this->dispatch('GET', '/kizlo/v1/post-types/post', ['categories' => [$term]]);

        $this->assertSame(200, $simple->get_status());
        $this->assertCount(1, $simple->get_data());

        $advanced = $this->dispatch('GET', '/kizlo/v1/post-types/post', [
            'categories' => ['terms' => [$term], 'include_children' => 'false', 'operator' => 'AND'],
        ]);

        $this->assertSame(200, $advanced->get_status());
        $this->assertCount(1, $advanced->get_data());
    }

    /**
     * A non-hierarchical taxonomy has no `include_children`, and an exclude filter
     * has no `operator`. Both differences come from core and neither was expressible
     * before, because every taxonomy filter was declared as a flat integer array.
     */
    public function test_the_advanced_form_follows_the_taxonomy(): void
    {
        $properties = $this->listProperties('post-types.post', '/post-types/post');

        $this->assertArrayNotHasKey('include_children', $this->objectForm($properties['tags'])['properties']);
        $this->assertArrayHasKey('operator', $this->objectForm($properties['tags'])['properties']);

        $this->assertArrayNotHasKey('operator', $this->objectForm($properties['categories_exclude'])['properties']);
        $this->assertArrayHasKey('include_children', $this->objectForm($properties['categories_exclude'])['properties']);
    }

    // ============================================================
    // PARAMETERS FROM OUTSIDE KIZLO
    // ============================================================

    /**
     * A parameter another plugin adds is contract surface too, so it is described
     * and generated like any other.
     */
    public function test_a_third_party_parameter_reaches_the_contract(): void
    {
        add_filter('rest_post_collection_params', static function (array $params): array {
            $params['acme_channel'] = ['type' => 'string', 'enum' => ['web', 'print']];

            return $params;
        });

        $this->assertArrayHasKey('acme_channel', $this->listProperties('post-types.post', '/post-types/post'));
    }

    /**
     * The hazard in deriving. A parameter with no usable type makes
     * `ArgTranslator::criticalErrors()` refuse to register the endpoint, which
     * would let any plugin take `/post-types/post` off the air. It is dropped and
     * reported instead, because a route that stops serving is a worse answer than
     * a contract with a hole in it that says so.
     */
    public function test_an_untranslatable_third_party_parameter_is_reported_without_taking_the_route_down(): void
    {
        add_filter('rest_post_collection_params', static function (array $params): array {
            $params['acme_broken'] = ['description' => 'No type, so nothing could be enforced.'];

            return $params;
        });

        $this->assertArrayNotHasKey('acme_broken', $this->listProperties('post-types.post', '/post-types/post'));
        $this->assertErrorContains($this->errors(), 'acme_broken');

        $this->boot();

        $this->assertArrayHasKey('/kizlo/v1/post-types/post', $this->server->get_routes());
        $this->assertSame(200, $this->dispatch('GET', '/kizlo/v1/post-types/post')->get_status());
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * @return array<string, array<string, mixed>>
     */
    private function listProperties(string $apiId, string $path): array
    {
        return $this->document()['apis'][$apiId]['paths'][$path]['list']['input']['properties'];
    }

    /**
     * The object member of a taxonomy filter's union.
     *
     * @param array<string, mixed> $filter
     * @return array<string, mixed>
     */
    private function objectForm(array $filter): array
    {
        foreach ($filter['oneOf'] as $member) {
            if (($member['type'] ?? null) === 'object') {
                return $member;
            }
        }

        $this->fail('The filter describes no object form.');
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

    /**
     * @param array<string, mixed> $query
     */
    private function dispatch(string $method, string $route, array $query = []): \WP_REST_Response
    {
        $request = new WP_REST_Request($method, $route);
        $request->set_query_params($query);

        return $this->server->dispatch($request);
    }
}
