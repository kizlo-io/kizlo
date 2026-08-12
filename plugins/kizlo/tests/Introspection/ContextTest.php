<?php

namespace Kizlo\Tests\Introspection;

use WP_REST_Request;
use WP_REST_Server;
use WP_REST_Posts_Controller;

/**
 * One shape per endpoint, because `context` is not a Kizlo concept.
 *
 * Core has a single item schema and filters each response against it per request,
 * so `?context=edit` and `?context=view` return different fields from the same
 * route. That is a request parameter deciding a response type. The contract has no
 * way to say it and a generated client has no way to use it, so the parameter is
 * gone from every managed route.
 *
 * Gone, not merely undescribed. `WP_REST_Request` hands back query parameters it
 * never registered, and both controllers fall back to `$request['context']`, so
 * deleting the argument on its own would have left `?context=view` quietly
 * reshaping the response with nothing in the contract admitting it. That is the
 * defect {@see DerivedParametersTest} exists to prevent, one level down. So the
 * API classes overwrite it instead.
 *
 * `edit` rather than `view` because core's contexts nest, `embed` inside `view`
 * inside `edit`. Pinning the widest one means every field the controller can
 * produce is produced and described, so nothing is hidden by omission. What a
 * browser is allowed to see is decided by the extension procedure that returns
 * it, which is the only route out.
 */
class ContextTest extends IntrospectionTestCase
{
    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
    }

    // ============================================================
    // THE PARAMETER IS GONE
    // ============================================================

    /**
     * @dataProvider managedListProvider
     */
    public function test_no_managed_list_describes_a_context_parameter(string $apiId, string $path): void
    {
        $this->assertArrayNotHasKey('context', $this->listProperties($apiId, $path));
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function managedListProvider(): array
    {
        return [
            'posts'      => ['post-types.post', '/post-types/post'],
            'pages'      => ['post-types.page', '/post-types/page'],
            'categories' => ['taxonomies.category', '/taxonomies/category'],
        ];
    }

    public function test_no_managed_retrieve_describes_a_context_parameter(): void
    {
        foreach (['post-types.post' => '/post-types/post', 'taxonomies.category' => '/taxonomies/category'] as $apiId => $path) {
            $input = $this->document()['apis'][$apiId]['paths'][$path . '/{identifier}']['retrieve']['input'];

            $this->assertArrayNotHasKey('context', $input['properties'], $apiId);
        }
    }

    /**
     * The controller still declares it, which is the point: this is a parameter
     * Kizlo removes, not one WordPress stopped having.
     */
    public function test_the_controller_still_declares_the_parameter_kizlo_dropped(): void
    {
        $this->assertArrayHasKey('context', (new WP_REST_Posts_Controller('post'))->get_collection_params());
    }

    // ============================================================
    // AND IT IS NOT HONOURED EITHER
    // ============================================================

    /**
     * The half that makes the contract true. Without the pin this request returns
     * a smaller object than the document describes, and nothing anywhere says so.
     *
     * @dataProvider ignoredContextProvider
     */
    public function test_a_context_a_caller_sends_does_not_reshape_the_response(string $context): void
    {
        $this->boot();

        $id = self::factory()->post->create(['post_type' => 'post', 'post_status' => 'publish']);

        $asked   = $this->dispatch('GET', '/kizlo/v1/post-types/post/' . $id, ['context' => $context]);
        $default = $this->dispatch('GET', '/kizlo/v1/post-types/post/' . $id);

        $this->assertSame(200, $asked->get_status());
        $this->assertSame(array_keys($default->get_data()), array_keys($asked->get_data()));
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function ignoredContextProvider(): array
    {
        return [
            'view'     => ['view'],
            'embed'    => ['embed'],
            'edit'     => ['edit'],
            'nonsense' => ['nonsense'],
        ];
    }

    public function test_a_list_response_is_the_same_shape_whatever_context_is_sent(): void
    {
        $this->boot();

        self::factory()->post->create(['post_type' => 'post', 'post_status' => 'publish']);

        $asked   = $this->dispatch('GET', '/kizlo/v1/post-types/post', ['context' => 'embed']);
        $default = $this->dispatch('GET', '/kizlo/v1/post-types/post');

        $this->assertSame(
            array_keys($default->get_data()[0]),
            array_keys($asked->get_data()[0]),
        );
    }

    public function test_a_term_response_is_the_same_shape_whatever_context_is_sent(): void
    {
        $this->boot();

        $term = self::factory()->term->create(['taxonomy' => 'category']);

        $asked   = $this->dispatch('GET', '/kizlo/v1/taxonomies/category/' . $term, ['context' => 'embed']);
        $default = $this->dispatch('GET', '/kizlo/v1/taxonomies/category/' . $term);

        $this->assertSame(200, $asked->get_status());
        $this->assertSame(array_keys($default->get_data()), array_keys($asked->get_data()));
    }

    // ============================================================
    // WHAT PINNING EDIT BUYS
    // ============================================================

    /**
     * The fields core only returns in its widest context. Under `view` these were
     * absent from the response and from the contract, so an extension author had
     * no way to reach a post's raw content without going around Kizlo.
     */
    public function test_the_widest_context_fields_are_returned(): void
    {
        $this->boot();

        $id = self::factory()->post->create([
            'post_type'    => 'post',
            'post_status'  => 'publish',
            'post_title'   => 'probe',
            'post_content' => 'body',
        ]);

        $data = $this->dispatch('GET', '/kizlo/v1/post-types/post/' . $id)->get_data();

        $this->assertArrayHasKey('password', $data);
        $this->assertSame('probe', $data['title']['raw']);
        $this->assertSame('body', $data['content']['raw']);
        $this->assertArrayHasKey('raw', $data['guid']);
    }

    /**
     * Every field the response carries is a field the document describes. This is
     * the assertion the whole arrangement is for, and it runs against a real
     * dispatch rather than against the schema alone.
     */
    public function test_the_response_carries_nothing_the_contract_omits(): void
    {
        $this->boot();

        $id = self::factory()->post->create(['post_type' => 'post', 'post_status' => 'publish']);

        $described = array_keys($this->document()['schemas']['post-types.post.item']['properties']);
        $returned  = array_keys($this->dispatch('GET', '/kizlo/v1/post-types/post/' . $id)->get_data());

        $this->assertSame([], array_diff($returned, $described));
    }

    /**
     * `_links` is the one exception, and it is not a field: `get_items()` folds
     * the response's HAL links into each item's data, so every list on every core
     * route carries it. Describing the envelope is a separate question from
     * describing the resource, and nothing here changed it either way.
     */
    public function test_a_list_item_carries_nothing_the_contract_omits(): void
    {
        $this->boot();

        self::factory()->post->create(['post_type' => 'post', 'post_status' => 'publish']);

        $described = array_keys($this->document()['schemas']['post-types.post.list-item']['properties']);
        $returned  = array_keys($this->dispatch('GET', '/kizlo/v1/post-types/post')->get_data()[0]);

        $this->assertSame(['_links'], array_values(array_diff($returned, $described)));
    }

    public function test_a_term_carries_nothing_the_contract_omits(): void
    {
        $this->boot();

        $term = self::factory()->term->create(['taxonomy' => 'category']);

        $described = array_keys($this->document()['schemas']['taxonomies.category.item']['properties']);
        $returned  = array_keys($this->dispatch('GET', '/kizlo/v1/taxonomies/category/' . $term)->get_data());

        $this->assertSame([], array_diff($returned, $described));
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
