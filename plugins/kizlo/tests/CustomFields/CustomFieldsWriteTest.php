<?php

namespace Kizlo\Tests\CustomFields;

use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use Kizlo\Modules\CustomFields\CustomFieldsModule;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\Introspection\ManagedContent;
use Kizlo\Tests\Introspection\IntrospectionTestCase;

/**
 * The Kizlo REST write contract: custom-field values are read from the grouped
 * `kizlo.custom` request property and validated before the row is created. A
 * create validates every definition, while a partial update validates only the
 * fields actually submitted, so a partial edit leaves untouched fields —
 * including required ones — as they were.
 *
 * Every case dispatches through `WP_REST_Server`, because the defect this suite
 * exists to catch was invisible to a hand-built request: the module resolved its
 * target from a `post_type` parameter that a real request never carries, so the
 * validation ran only in tests that set one by hand.
 *
 * Dispatching also settles which layer answers. A rule the published schema can
 * express is enforced by WordPress first and answers `rest_invalid_param`; only
 * a rule the schema cannot express reaches `CustomFieldsStore::assertWritable`
 * and answers `kizlo_custom_fields_invalid`. Each case asserts the code its own
 * rule produces, so a check quietly moving between the two fails here.
 */
class CustomFieldsWriteTest extends IntrospectionTestCase
{
    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAsAdmin();
    }

    // ============================================================
    // CREATE
    // ============================================================

    public function test_create_accepts_valid_grouped_custom_field_values(): void
    {
        $this->seed([['type' => 'text', 'name' => 'company_name']]);

        $response = $this->create(['company_name' => 'Acme Ltd']);

        $this->assertSame(201, $response->get_status());
        $this->assertSame('Acme Ltd', get_post_meta($response->get_data()['id'], 'kcf_company_name', true));
    }

    public function test_create_rejects_invalid_grouped_custom_field_values(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank']]);

        // `number` is on the published schema, so WordPress answers first.
        $this->assertRejected('rest_invalid_param', $this->create(['rank' => 'not-a-number']));
    }

    public function test_create_rejects_a_missing_required_field_when_other_fields_are_sent(): void
    {
        $this->seed([
            ['type' => 'text', 'name' => 'subtitle'],
            ['type' => 'number', 'name' => 'rank', 'required' => true],
        ]);

        $this->assertRejected('rest_invalid_param', $this->create(['subtitle' => 'Hello']));
    }

    public function test_a_write_without_custom_field_keys_is_a_no_op(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank']]);

        // No required field, so the envelope is optional and its absence leaves
        // the stored values alone rather than failing the published contract.
        $response = $this->dispatch('POST', '/kizlo/v1/post-types/post', ['title' => 'Hello']);

        $this->assertSame(201, $response->get_status());
        $this->assertNoCustomMeta($response->get_data()['id']);
    }

    public function test_a_kizlo_group_carrying_no_custom_fields_is_a_no_op(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank']]);

        // The envelope holds more than custom fields, so one that omits them
        // leaves the stored values alone. A create that has to send them never
        // reaches here: the derived schema requires `custom` inside `kizlo`.
        $response = $this->dispatch('POST', '/kizlo/v1/post-types/post', [
            'title' => 'Hello',
            'kizlo' => [],
        ]);

        $this->assertSame(201, $response->get_status());
        $this->assertNoCustomMeta($response->get_data()['id']);
    }

    public function test_a_top_level_custom_group_is_ignored(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank']]);

        // The path writes used before they moved under the envelope. A value that
        // would be rejected if it were read proves it no longer is.
        $response = $this->dispatch('POST', '/kizlo/v1/post-types/post', [
            'title'  => 'Hello',
            'custom' => ['rank' => 'not-a-number'],
        ]);

        $this->assertSame(201, $response->get_status());
        $this->assertNoCustomMeta($response->get_data()['id']);
    }

    public function test_a_non_object_custom_group_is_rejected(): void
    {
        $this->seed([['type' => 'text', 'name' => 'subtitle']]);

        $response = $this->dispatch('POST', '/kizlo/v1/post-types/post', [
            'title' => 'Hello',
            'kizlo' => ['custom' => 'not-an-object'],
        ]);

        $this->assertRejected('rest_invalid_param', $response);
    }

    public function test_a_non_object_kizlo_group_is_rejected(): void
    {
        $this->seed([['type' => 'text', 'name' => 'subtitle']]);

        $response = $this->dispatch('POST', '/kizlo/v1/post-types/post', [
            'title' => 'Hello',
            'kizlo' => 'not-an-object',
        ]);

        $this->assertRejected('rest_invalid_param', $response);
    }

    // ============================================================
    // UPDATE
    // ============================================================

    public function test_update_allows_omitting_an_untouched_required_field(): void
    {
        $this->seed([
            ['type' => 'text', 'name' => 'subtitle'],
            ['type' => 'number', 'name' => 'rank', 'required' => true],
        ]);

        $post = $this->createPost();
        update_post_meta($post->ID, 'kcf_rank', 5);

        // Only `subtitle` is submitted, so the untouched required `rank` is left
        // alone rather than being reported as missing.
        $response = $this->update($post->ID, ['subtitle' => 'Hello']);

        $this->assertSame(200, $response->get_status());
        $this->assertSame('5', get_post_meta($post->ID, 'kcf_rank', true));
    }

    public function test_update_still_rejects_an_emptied_required_field(): void
    {
        $this->seed([['type' => 'text', 'name' => 'headline', 'required' => true]]);

        $post = $this->createPost();

        // Present in the payload but blank. A blank string satisfies the
        // published `string`, so this is a rule only the store can enforce.
        $this->assertRejected('kizlo_custom_fields_invalid', $this->update($post->ID, ['headline' => '']));
    }

    public function test_update_persists_the_submitted_field_and_leaves_the_rest_untouched(): void
    {
        $definitions = [
            ['type' => 'text', 'name' => 'subtitle'],
            ['type' => 'number', 'name' => 'rank'],
        ];

        $this->seed($definitions);

        $post = $this->createPost();
        CustomFieldsStore::write(
            CustomFieldsStore::META_POST,
            $post->ID,
            FieldDefinitions::normalize($definitions),
            ['subtitle' => 'Old', 'rank' => 5],
        );

        $response = $this->update($post->ID, ['subtitle' => 'New']);

        $this->assertSame(200, $response->get_status());
        $this->assertSame('New', get_post_meta($post->ID, 'kcf_subtitle', true), 'The submitted field is updated.');
        $this->assertSame('5', get_post_meta($post->ID, 'kcf_rank', true), 'The omitted field keeps its stored value.');
    }

    // ============================================================
    // RULES THE PUBLISHED SCHEMA CANNOT EXPRESS
    // ============================================================

    public function test_image_fields_reject_a_missing_attachment(): void
    {
        $this->seed([['type' => 'image', 'name' => 'cover']]);

        $before = $this->postCount();

        $this->assertRejected('kizlo_custom_fields_invalid', $this->create(['cover' => 99999]));

        $this->assertSame($before, $this->postCount(), 'The row is refused, not created and left half-written.');
    }

    public function test_image_fields_reject_non_image_attachments(): void
    {
        $this->seed([['type' => 'image', 'name' => 'cover']]);

        $attachment = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => 'video/mp4',
            'post_status'    => 'inherit',
        ]);

        $before = $this->postCount();

        $this->assertRejected('kizlo_custom_fields_invalid', $this->create(['cover' => $attachment]));

        $this->assertSame($before, $this->postCount());
    }

    public function test_file_fields_accept_any_attachment_media_type(): void
    {
        $this->seed([['type' => 'file', 'name' => 'download']]);

        $attachment = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => 'application/pdf',
            'post_status'    => 'inherit',
        ]);

        $response = $this->create(['download' => $attachment]);

        $this->assertSame(201, $response->get_status());
        $this->assertSame((string) $attachment, get_post_meta($response->get_data()['id'], 'kcf_download', true));
    }

    public function test_required_group_needs_one_populated_descendant(): void
    {
        $this->seed([[
            'type'     => 'group',
            'name'     => 'details',
            'required' => true,
            'fields'   => [['type' => 'text', 'name' => 'note']],
        ]]);

        // The published schema can say the group is required, not that something
        // inside it has to be filled in.
        $this->assertRejected('kizlo_custom_fields_invalid', $this->create(['details' => ['note' => '']]));

        $this->assertSame(201, $this->create(['details' => ['note' => 'Present']])->get_status());
    }

    /** @dataProvider storeEnforcedValueProvider */
    public function test_a_rule_the_schema_cannot_express_is_enforced_by_the_store(array $raw, mixed $value): void
    {
        $this->seed([$raw]);

        $this->assertRejected('kizlo_custom_fields_invalid', $this->create([$raw['name'] => $value]));
    }

    /** @return array<string, array{0: array<string, mixed>, 1: mixed}> */
    public function storeEnforcedValueProvider(): array
    {
        // A `min` that is not a multiple of `step` publishes no `multipleOf`,
        // because the contract counts a step from zero and the store counts it
        // from `min`. The store is the only enforcer left.
        $offset = ['type' => 'number', 'name' => 'score', 'min' => 1, 'max' => 10, 'step' => 2];

        // WordPress validates `date-time`, `email`, `ip`, `uuid` and `hex-color`
        // formats, and not `date`, so only the published pattern applies and a
        // calendar check has nowhere else to happen.
        $date = ['type' => 'date', 'name' => 'launch'];

        return [
            'off step from an offset minimum' => [$offset, 4],
            'non leap day'                    => [$date, '2025-02-29'],
            'invalid month and day'           => [$date, '2026-13-40'],
        ];
    }

    /** @dataProvider schemaEnforcedValueProvider */
    public function test_a_rule_the_schema_expresses_is_enforced_before_the_store(array $raw, mixed $value): void
    {
        $this->seed([$raw]);

        $this->assertRejected('rest_invalid_param', $this->create([$raw['name'] => $value]));
    }

    /** @return array<string, array{0: array<string, mixed>, 1: mixed}> */
    public function schemaEnforcedValueProvider(): array
    {
        // A minimum of 0 is a faithful step base, so `multipleOf` is published
        // and WordPress enforces the step itself.
        $number = ['type' => 'number', 'name' => 'score', 'min' => 0, 'max' => 10, 'step' => 2];

        return [
            'below minimum'  => [$number, -1],
            'above maximum'  => [$number, 11],
            'off step'       => [$number, 3],
            'malformed date' => [['type' => 'date', 'name' => 'launch'], 'yesterday'],
        ];
    }

    public function test_number_constraints_accept_a_value_on_step(): void
    {
        $this->seed([['type' => 'number', 'name' => 'score', 'min' => 0, 'max' => 10, 'step' => 2]]);

        $this->assertSame(201, $this->create(['score' => 4])->get_status());
    }

    // ============================================================
    // TAXONOMIES
    // ============================================================

    public function test_a_managed_taxonomy_create_validates_against_its_own_definitions(): void
    {
        $this->seedTaxonomy([['type' => 'image', 'name' => 'badge']]);

        $response = $this->dispatch('POST', '/kizlo/v1/taxonomies/category', [
            'name'  => 'Reviews',
            'kizlo' => ['custom' => ['badge' => 99999]],
        ]);

        $this->assertRejected('kizlo_custom_fields_invalid', $response);
        $this->assertNull(get_term_by('name', 'Reviews', 'category') ?: null);
    }

    public function test_a_taxonomy_replace_is_validated_and_persisted_like_an_update(): void
    {
        $this->seedTaxonomy([
            ['type' => 'text', 'name' => 'blurb'],
            ['type' => 'image', 'name' => 'badge'],
        ]);

        $term = self::factory()->term->create(['taxonomy' => 'category']);

        // `replace` is a PUT sharing `update`'s declaration and handler. It has
        // to carry the same validation, and the same marker the insert hook
        // reads — without one it would silently persist nothing at all.
        $rejected = $this->dispatch('PUT', '/kizlo/v1/taxonomies/category/' . $term, [
            'kizlo' => ['custom' => ['badge' => 99999]],
        ]);

        $this->assertRejected('kizlo_custom_fields_invalid', $rejected);

        $accepted = $this->dispatch('PUT', '/kizlo/v1/taxonomies/category/' . $term, [
            'kizlo' => ['custom' => ['blurb' => 'Written over PUT']],
        ]);

        $this->assertSame(200, $accepted->get_status());
        $this->assertSame('Written over PUT', get_term_meta($term, 'kcf_blurb', true));
    }

    // ============================================================
    // THE BOUNDARIES AROUND THE CHECK
    // ============================================================

    public function test_an_anonymous_caller_is_left_to_the_route_permission_check(): void
    {
        $this->seed([['type' => 'image', 'name' => 'cover']]);

        wp_set_current_user(0);
        unset($GLOBALS['wp_rest_application_password_uuid']);

        // The route-level validate_callback runs before the route's
        // permission_callback, and an error there skips the permission check
        // altogether. Answering 400 for an ID that is not an image while a valid
        // one passes would tell a logged-out caller which attachment IDs exist.
        $response = $this->create(['cover' => 99999]);

        $this->assertRejected('kizlo_rest_unauthorized', $response, 401);
    }

    public function test_a_core_route_write_is_not_a_second_authoring_path(): void
    {
        $this->seed([['type' => 'text', 'name' => 'subtitle']]);

        // The insert hooks are keyed on post type, so they fire for core's own
        // routes too. Those never declare `kizlo`, so nothing validated this
        // payload and it must not be written.
        $response = $this->dispatch('POST', '/wp/v2/posts', [
            'title'  => 'Via Core Route',
            'status' => 'publish',
            'kizlo'  => ['custom' => ['subtitle' => 'Never Stored']],
        ]);

        $this->assertSame(201, $response->get_status());
        $this->assertNoCustomMeta($response->get_data()['id']);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /** @param array<int, array<string, mixed>> $raw */
    private function seed(array $raw): void
    {
        $this->seedSettings(['post_types' => ['post' => [
            'custom_fields' => FieldDefinitions::normalize($raw),
        ]]]);

        $this->boot();
    }

    /** @param array<int, array<string, mixed>> $raw */
    private function seedTaxonomy(array $raw): void
    {
        $this->seedSettings(['taxonomies' => ['category' => [
            'custom_fields' => FieldDefinitions::normalize($raw),
        ]]]);

        $this->boot();
    }

    /** Register everything queued on rest_api_init and take the resulting server. */
    private function boot(): void
    {
        global $wp_rest_server;

        ManagedContent::flush();

        // The suite boots the plugin on `muplugins_loaded`, which is before
        // WordPress registers its initial post types, so the `rest_after_insert_*`
        // hooks the module keys on them were never added in this process. Register
        // now that the types and the seeded settings exist, dropping the filter the
        // early boot did add rather than stacking a second copy of it.
        remove_all_filters('kizlo_validate_managed_write');
        (new CustomFieldsModule())->register();

        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        do_action('rest_api_init', $this->server);
    }

    /** @param array<string, mixed> $params */
    private function dispatch(string $method, string $route, array $params = []): WP_REST_Response
    {
        $request = new WP_REST_Request($method, $route);

        foreach ($params as $key => $value) {
            $request->set_param($key, $value);
        }

        return $this->server->dispatch($request);
    }

    /** @param array<string, mixed> $custom */
    private function create(array $custom): WP_REST_Response
    {
        return $this->dispatch('POST', '/kizlo/v1/post-types/post', [
            'title' => 'Hello',
            'kizlo' => ['custom' => $custom],
        ]);
    }

    /** @param array<string, mixed> $custom */
    private function update(int $post_id, array $custom): WP_REST_Response
    {
        return $this->dispatch('PATCH', '/kizlo/v1/post-types/post/' . $post_id, [
            'kizlo' => ['custom' => $custom],
        ]);
    }

    private function assertRejected(string $code, WP_REST_Response $response, int $status = 400): void
    {
        $this->assertSame($status, $response->get_status());
        $this->assertSame($code, $response->get_data()['code']);
    }

    private function assertNoCustomMeta(int $post_id): void
    {
        foreach (array_keys(get_post_meta($post_id)) as $key) {
            $this->assertStringStartsNotWith('kcf_', (string) $key);
        }
    }

    private function postCount(): int
    {
        return count(get_posts(['post_type' => 'post', 'post_status' => 'any', 'numberposts' => -1]));
    }
}
