<?php

namespace Kizlo\Tests\Seo;

use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use Kizlo\Modules\Introspection\ManagedContent;
use Kizlo\Modules\Seo\SeoBase;
use Kizlo\Modules\Seo\SeoModule;
use Kizlo\Modules\Seo\SeoMetaBox;
use Kizlo\Modules\Seo\SeoOverridesStore;
use Kizlo\Tests\Introspection\IntrospectionTestCase;

/**
 * The Kizlo REST write contract for SEO: overrides are read from the grouped
 * `kizlo.seo` request property, validated before the row is created, and written
 * once it exists. A write that carries no group leaves the stored overrides
 * alone, and a submitted-but-empty field clears its key so the item falls back to
 * its template.
 *
 * Every case dispatches through `WP_REST_Server` rather than calling the module,
 * because the target is settled by which route the request reached, and a
 * hand-built request reaches none. Dispatching also settles which layer answers:
 * a rule the published `kizlo.seo-input` schema can express is enforced by
 * WordPress first and answers `rest_invalid_param`, while only a rule it cannot
 * express reaches `SeoOverridesStore::assertWritable` and answers
 * `kizlo_seo_invalid`.
 */
class SeoWriteTest extends IntrospectionTestCase
{
    private const ACTION = 'kizlo_seo_save';
    private const NONCE  = 'kizlo_seo_nonce';

    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
        $this->boot();
    }

    // ============================================================
    // VALIDATION, BEFORE THE ROW EXISTS
    // ============================================================

    public function test_create_accepts_a_valid_grouped_seo_payload(): void
    {
        $response = $this->create([
            'title'        => 'Custom Title',
            'description'  => 'Custom description.',
            'canonical'    => 'https://example.com/custom',
            'webpage_type' => 'AboutPage',
            'noindex'      => true,
            'og'           => ['title' => 'OG Title'],
        ]);

        $this->assertSame(201, $response->get_status());
    }

    public function test_the_target_comes_from_the_route_the_request_reached(): void
    {
        // Nothing sets `post_type` on a real request, so resolving the target
        // from one skipped this validation on every request that mattered. The
        // route is the only thing that names the slug, and dispatching is the
        // only way to reach it.
        $request = new WP_REST_Request('POST', '/kizlo/v1/post-types/post');
        $request->set_param('title', 'Hello');
        $request->set_param('kizlo', ['seo' => ['og' => ['image_id' => 99999]]]);

        $this->assertNull($request->get_param('post_type'));
        $this->assertRejected('kizlo_seo_invalid', $this->server->dispatch($request));
    }

    public function test_a_read_route_in_the_namespace_is_not_a_write(): void
    {
        // Only the managed write operations mount the check, so a Kizlo route
        // that is not one carries no validation to trip over.
        $response = $this->dispatch('GET', '/kizlo/v1/seo/homepage', [
            'kizlo' => ['seo' => ['og' => ['image_id' => 99999]]],
        ]);

        $this->assertSame(200, $response->get_status());
    }

    public function test_a_non_object_seo_group_is_rejected(): void
    {
        $this->assertRejected('rest_invalid_param', $this->dispatch('POST', '/kizlo/v1/post-types/post', [
            'title' => 'Hello',
            'kizlo' => ['seo' => 'not-an-object'],
        ]));
    }

    public function test_a_non_object_social_group_is_rejected(): void
    {
        $this->assertRejected('rest_invalid_param', $this->create(['og' => 'not-an-object']));
    }

    public function test_a_non_object_kizlo_group_is_rejected(): void
    {
        $this->assertRejected('rest_invalid_param', $this->dispatch('POST', '/kizlo/v1/post-types/post', [
            'title' => 'Hello',
            'kizlo' => 'not-an-object',
        ]));
    }

    public function test_a_write_carrying_no_seo_group_is_a_no_op(): void
    {
        $bare = $this->dispatch('POST', '/kizlo/v1/post-types/post', ['title' => 'Hello']);
        $this->assertSame(201, $bare->get_status());
        $this->assertNoOverrides($bare->get_data()['id']);

        $empty = $this->dispatch('POST', '/kizlo/v1/post-types/post', ['title' => 'Hello', 'kizlo' => []]);
        $this->assertSame(201, $empty->get_status());
        $this->assertNoOverrides($empty->get_data()['id']);
    }

    public function test_an_image_id_naming_a_missing_attachment_is_rejected(): void
    {
        $this->assertRejected('kizlo_seo_invalid', $this->create(['og' => ['image_id' => 99999]]));
    }

    public function test_an_image_id_naming_a_non_image_attachment_is_rejected(): void
    {
        $attachment = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => 'video/mp4',
            'post_status'    => 'inherit',
        ]);

        $this->assertRejected('kizlo_seo_invalid', $this->create(['twitter' => ['image_id' => $attachment]]));
    }

    public function test_a_valid_image_attachment_is_accepted_and_persisted(): void
    {
        $image = $this->createImage();

        $response = $this->create(['og' => ['image_id' => $image]]);

        $this->assertSame(201, $response->get_status());
        $this->assertSame((string) $image, $this->meta($response->get_data()['id'], 'og_image_id'));
    }

    public function test_a_rejected_image_leaves_every_other_submitted_field_unwritten(): void
    {
        $before = $this->postCount();

        $response = $this->create(['title' => 'Never Stored', 'og' => ['image_id' => 99999]]);

        $this->assertRejected('kizlo_seo_invalid', $response);

        // Validation runs before the route callback, so no row is created and
        // nothing from the payload reaches meta.
        $this->assertSame($before, $this->postCount());
    }

    public function test_an_anonymous_caller_is_left_to_the_route_permission_check(): void
    {
        $image = $this->createImage();

        wp_set_current_user(0);
        unset($GLOBALS['wp_rest_application_password_uuid']);

        // The route-level validate_callback runs before the route's
        // permission_callback, and an error there skips the permission check
        // altogether. Answering 400 for an ID that is not an image and letting a
        // real one through would tell a logged-out caller which attachment IDs
        // exist, so neither payload may be inspected here.
        $this->assertRejected('kizlo_rest_unauthorized', $this->create(['og' => ['image_id' => 99999]]), 401);
        $this->assertRejected('kizlo_rest_unauthorized', $this->create(['og' => ['image_id' => $image]]), 401);
    }

    // ============================================================
    // PERSISTENCE, ONCE THE ROW EXISTS
    // ============================================================

    public function test_a_core_route_write_is_not_a_second_authoring_path(): void
    {
        // The insert hooks are keyed on post type, so they fire for core's own
        // routes too. Those never declare `kizlo`, so nothing validated this
        // payload and it must not be written.
        $response = $this->dispatch('POST', '/wp/v2/posts', [
            'title'  => 'Via Core Route',
            'status' => 'publish',
            'kizlo'  => ['seo' => ['title' => 'Via Core Route', 'titel' => 'typo']],
        ]);

        $this->assertSame(201, $response->get_status());
        $this->assertNoOverrides($response->get_data()['id']);
    }

    public function test_the_insert_hook_persists_the_submitted_values(): void
    {
        $response = $this->create([
            'title'        => 'Custom Title',
            'description'  => 'Custom description.',
            'canonical'    => 'https://example.com/custom',
            'webpage_type' => 'AboutPage',
            'article_type' => 'NewsArticle',
            'noindex'      => true,
            'nofollow'     => false,
            'og'           => ['title' => 'OG Title', 'description' => 'OG description.'],
            'twitter'      => ['title' => 'Twitter Title'],
        ]);

        $this->assertSame(201, $response->get_status());

        $id = $response->get_data()['id'];

        $this->assertSame('Custom Title', $this->meta($id, 'title'));
        $this->assertSame('Custom description.', $this->meta($id, 'description'));
        $this->assertSame('https://example.com/custom', $this->meta($id, 'canonical'));
        $this->assertSame('AboutPage', $this->meta($id, 'webpage_type'));
        $this->assertSame('NewsArticle', $this->meta($id, 'article_type'));
        $this->assertSame('1', $this->meta($id, 'noindex'));
        $this->assertSame('OG Title', $this->meta($id, 'og_title'));
        $this->assertSame('OG description.', $this->meta($id, 'og_description'));
        $this->assertSame('Twitter Title', $this->meta($id, 'twitter_title'));

        // A false boolean is stored as absence, the same way the meta box has
        // always stored an unchecked box.
        $this->assertFalse(metadata_exists('post', $id, SeoBase::OVERRIDE_KEYS['nofollow']));
    }

    public function test_an_update_leaves_unsubmitted_keys_untouched(): void
    {
        $post = $this->createPost([], ['title' => 'Stored Title', 'description' => 'Stored description.']);

        $response = $this->update($post->ID, ['title' => 'New Title']);

        $this->assertSame(200, $response->get_status());
        $this->assertSame('New Title', $this->meta($post->ID, 'title'), 'The submitted field is updated.');
        $this->assertSame('Stored description.', $this->meta($post->ID, 'description'), 'The omitted field keeps its stored value.');
    }

    public function test_an_empty_value_deletes_its_key(): void
    {
        $post = $this->createPost([], ['title' => 'Stored Title']);

        $this->update($post->ID, ['title' => '']);

        $this->assertFalse(
            metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']),
            'The key is removed so the post falls back to its post-type template.'
        );
    }

    public function test_a_literal_zero_is_stored_rather_than_treated_as_empty(): void
    {
        $post = $this->createPost([], ['title' => 'Stored Title']);

        $this->update($post->ID, ['title' => '0']);

        // "0" is a value, not an absence: only an empty value clears an override.
        $this->assertSame('0', $this->meta($post->ID, 'title'));
        $this->assertTrue(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_a_non_scalar_value_is_refused_by_the_contract_and_by_the_store(): void
    {
        $post = $this->createPost([], ['title' => 'Stored Title']);

        // `title` and `canonical` are published as strings, so an array is now
        // rejected before the store sees it.
        $this->assertRejected('rest_invalid_param', $this->update($post->ID, [
            'title'     => ['nested'],
            'canonical' => ['nested'],
        ]));

        $this->assertSame('Stored Title', $this->meta($post->ID, 'title'));

        // The store still refuses one on its own, because WordPress's sanitizers
        // answer '' for an array and casting first would have stored the literal
        // string "Array".
        SeoOverridesStore::write(SeoOverridesStore::META_POST, $post->ID, SeoOverridesStore::fromInput(
            SeoOverridesStore::META_POST,
            ['title' => ['nested'], 'canonical' => ['nested']],
        ));

        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']));
        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['canonical']));
    }

    public function test_rest_and_the_meta_box_produce_identical_meta(): void
    {
        $image = $this->createImage();

        $payload = [
            'title'        => 'Shared Title',
            'description'  => 'Shared description.',
            'canonical'    => 'https://example.com/shared',
            'webpage_type' => 'AboutPage',
            'article_type' => 'NewsArticle',
            'noindex'      => true,
            'nofollow'     => true,
            'og'           => ['title' => 'OG Title', 'description' => 'OG description.', 'image_id' => $image],
            'twitter'      => ['title' => 'Tw Title', 'description' => 'Tw description.', 'image_id' => $image],
        ];

        $over_rest = $this->create($payload)->get_data()['id'];

        // The editor posts the same values flat, which is the shape the shared
        // store's sanitizers have always been written against.
        $flat = [
            'title'               => $payload['title'],
            'description'         => $payload['description'],
            'canonical'           => $payload['canonical'],
            'webpage_type'        => $payload['webpage_type'],
            'article_type'        => $payload['article_type'],
            'noindex'             => $payload['noindex'],
            'nofollow'            => $payload['nofollow'],
            'og_title'            => $payload['og']['title'],
            'og_description'      => $payload['og']['description'],
            'og_image_id'         => $payload['og']['image_id'],
            'twitter_title'       => $payload['twitter']['title'],
            'twitter_description' => $payload['twitter']['description'],
            'twitter_image_id'    => $payload['twitter']['image_id'],
        ];

        $over_editor = $this->createPost();
        $this->actingAsAdmin();
        $_POST[self::NONCE] = wp_create_nonce(self::ACTION);
        $_POST['kizlo_seo'] = wp_slash(wp_json_encode($flat));
        (new SeoMetaBox())->save($over_editor->ID);
        unset($_POST[self::NONCE], $_POST['kizlo_seo']);

        $this->assertSame(
            SeoOverridesStore::read(SeoOverridesStore::META_POST, $over_editor->ID),
            SeoOverridesStore::read(SeoOverridesStore::META_POST, $over_rest),
            'The two authoring paths share one store, so the same payload stores the same meta.'
        );
    }

    // ============================================================
    // TERMS
    // ============================================================

    public function test_terms_accept_the_shared_surface(): void
    {
        $term_id = self::factory()->term->create(['taxonomy' => 'category']);

        $response = $this->updateTerm($term_id, [
            'title'   => 'Term Title',
            'noindex' => true,
            'og'      => ['title' => 'Term OG Title'],
        ]);

        $this->assertSame(200, $response->get_status());
        $this->assertSame('Term Title', get_term_meta($term_id, SeoBase::OVERRIDE_KEYS['title'], true));
        $this->assertSame('1', get_term_meta($term_id, SeoBase::OVERRIDE_KEYS['noindex'], true));
        $this->assertSame('Term OG Title', get_term_meta($term_id, SeoBase::OVERRIDE_KEYS['og_title'], true));
    }

    public function test_a_term_replace_carries_the_same_surface_as_an_update(): void
    {
        $term_id = self::factory()->term->create(['taxonomy' => 'category']);

        // `replace` is a PUT sharing `update`'s declaration and handler, so it
        // is validated and persisted the same way. Without its own validator it
        // would carry no check and, because the insert hook reads the marker the
        // validator sets, would quietly persist nothing at all.
        $this->assertRejected('kizlo_seo_invalid', $this->dispatch('PUT', '/kizlo/v1/taxonomies/category/' . $term_id, [
            'kizlo' => ['seo' => ['og' => ['image_id' => 99999]]],
        ]));

        $accepted = $this->dispatch('PUT', '/kizlo/v1/taxonomies/category/' . $term_id, [
            'kizlo' => ['seo' => ['title' => 'Written over PUT']],
        ]);

        $this->assertSame(200, $accepted->get_status());
        $this->assertSame('Written over PUT', get_term_meta($term_id, SeoBase::OVERRIDE_KEYS['title'], true));
    }

    public function test_an_empty_value_deletes_its_term_key(): void
    {
        $term_id = self::factory()->term->create(['taxonomy' => 'category']);
        $this->applyTermOverrides($term_id, ['title' => 'Stored Title']);

        $this->updateTerm($term_id, ['title' => '']);

        $this->assertFalse(metadata_exists('term', $term_id, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_the_post_only_type_fields_never_reach_term_meta(): void
    {
        $term_id = self::factory()->term->create(['taxonomy' => 'category']);

        // The term schema does not declare them, and it is closed, so they no
        // longer get as far as the store.
        $this->assertRejected('rest_invalid_param', $this->updateTerm($term_id, [
            'webpage_type' => 'AboutPage',
            'article_type' => 'NewsArticle',
        ]));

        // The store does not carry them either, so a payload reaching it by any
        // other route still writes nothing.
        SeoOverridesStore::write(SeoOverridesStore::META_TERM, $term_id, SeoOverridesStore::fromInput(
            SeoOverridesStore::META_TERM,
            ['webpage_type' => 'AboutPage', 'article_type' => 'NewsArticle'],
        ));

        $this->assertFalse(metadata_exists('term', $term_id, SeoBase::OVERRIDE_KEYS['webpage_type']));
        $this->assertFalse(metadata_exists('term', $term_id, SeoBase::OVERRIDE_KEYS['article_type']));
    }

    // ============================================================
    // THE STORE ITSELF
    // ============================================================

    public function test_the_term_surface_drops_the_post_only_fields(): void
    {
        $post_fields = SeoOverridesStore::fields(SeoOverridesStore::META_POST);
        $term_fields = SeoOverridesStore::fields(SeoOverridesStore::META_TERM);

        $this->assertSame(array_keys(SeoBase::OVERRIDE_KEYS), $post_fields);
        $this->assertSame(['webpage_type', 'article_type'], array_values(array_diff($post_fields, $term_fields)));
    }

    public function test_the_override_keys_stay_unregistered(): void
    {
        $registered = get_registered_meta_keys('post');

        foreach (SeoBase::OVERRIDE_KEYS as $meta_key) {
            $this->assertArrayNotHasKey(
                $meta_key,
                $registered,
                "\"{$meta_key}\" must stay out of the native meta object."
            );
        }
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * Register everything queued on rest_api_init and take the resulting server.
     *
     * The suite boots the plugin on `muplugins_loaded`, which is before WordPress
     * registers its initial post types, so the `rest_after_insert_*` hooks the
     * module keys on them were never added in this process. Register now that the
     * types and the seeded settings exist, dropping the filter the early boot did
     * add rather than stacking a second copy of it.
     */
    private function boot(): void
    {
        global $wp_rest_server;

        ManagedContent::flush();

        remove_all_filters('kizlo_validate_managed_write');
        (new SeoModule())->register();

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

    /** @param array<string, mixed> $seo */
    private function create(array $seo): WP_REST_Response
    {
        return $this->dispatch('POST', '/kizlo/v1/post-types/post', [
            'title' => 'Hello',
            'kizlo' => ['seo' => $seo],
        ]);
    }

    /** @param array<string, mixed> $seo */
    private function update(int $post_id, array $seo): WP_REST_Response
    {
        return $this->dispatch('PATCH', '/kizlo/v1/post-types/post/' . $post_id, [
            'kizlo' => ['seo' => $seo],
        ]);
    }

    /** @param array<string, mixed> $seo */
    private function updateTerm(int $term_id, array $seo): WP_REST_Response
    {
        return $this->dispatch('PATCH', '/kizlo/v1/taxonomies/category/' . $term_id, [
            'kizlo' => ['seo' => $seo],
        ]);
    }

    private function assertRejected(string $code, WP_REST_Response $response, int $status = 400): void
    {
        $this->assertSame($status, $response->get_status());
        $this->assertSame($code, $response->get_data()['code']);
    }

    private function assertNoOverrides(int $post_id): void
    {
        foreach (SeoBase::OVERRIDE_KEYS as $meta_key) {
            $this->assertFalse(metadata_exists('post', $post_id, $meta_key), "\"{$meta_key}\" was written.");
        }
    }

    /** The stored value for an override field, or '' when the key is absent. */
    private function meta(int $post_id, string $field): string
    {
        return (string) get_post_meta($post_id, SeoBase::OVERRIDE_KEYS[$field], true);
    }

    private function postCount(): int
    {
        return count(get_posts(['post_type' => 'post', 'post_status' => 'any', 'numberposts' => -1]));
    }
}
