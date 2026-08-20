<?php

namespace Kizlo\Tests\Introspection;

use WP_REST_Request;
use WP_REST_Server;
use WP_REST_Posts_Controller;
use WP_REST_Terms_Controller;
use Kizlo\Modules\Introspection\CoreSchemas;

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
            $this->honoured((new WP_REST_Posts_Controller('post'))->get_collection_params()),
            $this->sorted(array_keys($this->listProperties('post-types.post', '/post-types/post'))),
        );
    }

    public function test_every_parameter_the_terms_controller_honours_is_described(): void
    {
        $this->assertSame(
            $this->honoured((new WP_REST_Terms_Controller('category'))->get_collection_params()),
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
            $this->honoured((new WP_REST_Posts_Controller('page'))->get_collection_params()),
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
    // STATUS
    // ============================================================

    /**
     * `status` was the one parameter held back from the derivation, because core
     * declares two different things under the name: an array-typed list filter
     * built from every registered status plus `any`, and the post's own
     * single-valued status, whose enum excludes internal ones. They are not
     * variants of each other, since you cannot write a post with status `inherit`
     * but can legitimately list trashed or scheduled ones, so the list filter
     * derives from the list filter, like every other parameter.
     *
     * The enum itself is named rather than inlined. {@see PostStatusTest} covers
     * the vocabulary; what matters here is that naming it did not change it.
     */
    public function test_the_status_filter_refers_to_the_shared_vocabulary(): void
    {
        $status = $this->listProperties('post-types.post', '/post-types/post')['status'];

        $this->assertSame('array', $status['type']);
        $this->assertSame(['$ref' => CoreSchemas::POST_STATUS_FILTER], $status['items']);
    }

    /**
     * The guard on that indirection. A reference is only safe while the schema it
     * points at still says what the controller says, so the two are compared
     * directly. Without this the shared vocabulary could drift from core exactly
     * the way the old hand-written declaration did, just one level further away
     * from the route where nobody would look.
     */
    public function test_the_shared_filter_vocabulary_matches_the_controller(): void
    {
        $this->assertSame(
            $this->sorted((new WP_REST_Posts_Controller('post'))->get_collection_params()['status']['items']['enum']),
            $this->sorted($this->document()['schemas'][CoreSchemas::POST_STATUS_FILTER]['enum']),
        );
    }

    /**
     * Kizlo used to declare the default as `['publish']` where core declares the
     * scalar `'publish'`, and core depends on the scalar:
     * `sanitize_post_statuses()` reads the registered default back off the request
     * and compares each requested status to it by identity, so an array default
     * never matches and every request falls through to a capability check instead.
     *
     * A scalar default on an array type looks like a mistake and is not one, which
     * is why it is pinned here rather than left to be tidied later. It reaches the
     * generator as `status?: PostStatus[]` either way, because `type` and
     * `items.enum` decide that.
     */
    public function test_the_status_default_is_core_s_scalar(): void
    {
        $this->assertSame('publish', $this->listProperties('post-types.post', '/post-types/post')['status']['default']);
    }

    /**
     * Enforcement follows from the enum. With `items` declared as a bare string
     * array, any value at all reached `WP_Query`, which answered a nonsense status
     * with an empty page rather than an error.
     */
    public function test_an_unknown_status_is_rejected(): void
    {
        $this->boot();

        $rejected = $this->dispatch('GET', '/kizlo/v1/post-types/post', ['status' => ['nonsense']]);

        $this->assertSame(400, $rejected->get_status());
        $this->assertSame('rest_invalid_param', $rejected->get_data()['code']);
    }

    public function test_listing_by_a_non_default_status_is_accepted(): void
    {
        $this->boot();

        self::factory()->post->create(['post_type' => 'post', 'post_status' => 'draft']);

        $response = $this->dispatch('GET', '/kizlo/v1/post-types/post', ['status' => ['draft']]);

        $this->assertSame(200, $response->get_status());
        $this->assertCount(1, $response->get_data());
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

        $first  = $this->document();
        $second = $this->document();

        $this->assertArrayNotHasKey('acme_broken', $first['apis']['post-types.post']['paths']['/post-types/post']['list']['input']['properties']);
        $this->assertErrorContains($first['diagnostics'], 'acme_broken');
        $this->assertSame($first['diagnostics'], $second['diagnostics']);
        $this->assertSame($first['hash'], $second['hash']);

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
     * The parameter names a managed list is expected to describe.
     *
     * `context` is the one thing the derivation drops, and it is dropped from the
     * route as well rather than only from the contract, so this is not the fork
     * reopening. {@see ContextTest}
     *
     * @param array<string, mixed> $params
     * @return array<int, string>
     */
    private function honoured(array $params): array
    {
        unset($params['context']);

        return $this->sorted(array_keys($params));
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
