<?php

namespace Kizlo\Tests\Seo;

use WP_Error;
use WP_REST_Request;
use Kizlo\Modules\Seo\SeoBase;
use Kizlo\Modules\Seo\SeoModule;
use Kizlo\Modules\Seo\SeoMetaBox;
use Kizlo\Modules\Seo\SeoOverridesStore;

/**
 * The Kizlo REST write contract for SEO: overrides are read from the grouped
 * `kizlo.seo` request property, validated before the row is created, and written
 * once it exists. A write that carries no group leaves the stored overrides
 * alone, and a submitted-but-empty field clears its key so the item falls back to
 * its template.
 */
class SeoWriteTest extends SeoTestCase
{
    private const ACTION = 'kizlo_seo_save';
    private const NONCE  = 'kizlo_seo_nonce';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedSettings();
        $this->actingAsAdmin();
    }

    /**
     * The real shape of a managed write: the slug is a path segment, never an
     * argument, because one route is registered per managed post type.
     *
     * @param array<string, mixed> $params
     */
    private function request(string $method, array $params): WP_REST_Request
    {
        $request = new WP_REST_Request($method, '/kizlo/v1/post-types/post');
        foreach ($params as $key => $value) {
            $request->set_param($key, $value);
        }
        return $request;
    }

    /** @param array<string, mixed> $params */
    private function termRequest(string $method, array $params): WP_REST_Request
    {
        $request = new WP_REST_Request($method, '/kizlo/v1/taxonomies/category');
        foreach ($params as $key => $value) {
            $request->set_param($key, $value);
        }
        return $request;
    }

    private function validate(WP_REST_Request $request): mixed
    {
        return (new SeoModule())->validateRequest(null, null, $request);
    }

    /** The stored value for an override field, or '' when the key is absent. */
    private function meta(int $post_id, string $field): string
    {
        return (string) get_post_meta($post_id, SeoBase::OVERRIDE_KEYS[$field], true);
    }

    // ============================================================
    // VALIDATION, BEFORE THE ROW EXISTS
    // ============================================================

    public function test_create_accepts_a_valid_grouped_seo_payload(): void
    {
        $this->assertNull($this->validate($this->request('POST', ['kizlo' => ['seo' => [
            'title'        => 'Custom Title',
            'description'  => 'Custom description.',
            'canonical'    => 'https://example.com/custom',
            'webpage_type' => 'AboutPage',
            'noindex'      => true,
            'og'           => ['title' => 'OG Title'],
        ]]])));
    }

    public function test_a_non_object_seo_group_is_rejected(): void
    {
        $result = $this->validate($this->request('PATCH', ['kizlo' => ['seo' => 'not-an-object']]));

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame('kizlo_seo_invalid', $result->get_error_code());
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    public function test_a_non_object_social_group_is_rejected(): void
    {
        $result = $this->validate($this->request('PATCH', ['kizlo' => ['seo' => ['og' => 'not-an-object']]]));

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    public function test_a_non_object_kizlo_group_is_rejected(): void
    {
        $result = $this->validate($this->request('PATCH', ['kizlo' => 'not-an-object']));

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    public function test_the_target_is_read_from_the_route_not_a_parameter(): void
    {
        // Nothing sets `post_type` on a real request, so resolving the target
        // from one would skip this validation on every request that matters.
        $request = new WP_REST_Request('POST', '/kizlo/v1/post-types/post');
        $request->set_param('kizlo', ['seo' => ['og' => ['image_id' => 99999]]]);

        $this->assertNull($request->get_param('post_type'));
        $this->assertInstanceOf(WP_Error::class, $this->validate($request));
    }

    public function test_a_route_outside_managed_content_is_ignored(): void
    {
        $request = new WP_REST_Request('POST', '/kizlo/v1/seo/homepage');
        $request->set_param('kizlo', ['seo' => ['og' => ['image_id' => 99999]]]);

        $this->assertNull($this->validate($request));
    }

    public function test_a_write_carrying_no_seo_group_is_a_no_op(): void
    {
        $this->assertNull($this->validate($this->request('POST', ['title' => 'Hello'])));
        $this->assertNull($this->validate($this->request('POST', ['kizlo' => []])));
    }

    public function test_an_image_id_naming_a_missing_attachment_is_rejected(): void
    {
        $result = $this->validate($this->request('POST', ['kizlo' => ['seo' => [
            'og' => ['image_id' => 99999],
        ]]]));

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    public function test_an_image_id_naming_a_non_image_attachment_is_rejected(): void
    {
        $attachment = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => 'video/mp4',
            'post_status'    => 'inherit',
        ]);

        $result = $this->validate($this->request('POST', ['kizlo' => ['seo' => [
            'twitter' => ['image_id' => $attachment],
        ]]]));

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    public function test_a_valid_image_attachment_is_accepted_and_persisted(): void
    {
        $image = $this->createImage();
        $post  = $this->createPost();

        $request = $this->request('POST', ['kizlo' => ['seo' => ['og' => ['image_id' => $image]]]]);

        $this->assertNull($this->validate($request));

        (new SeoModule())->register();
        do_action('rest_after_insert_post', $post, $request);

        $this->assertSame((string) $image, $this->meta($post->ID, 'og_image_id'));
    }

    public function test_a_rejected_image_leaves_every_other_submitted_field_unwritten(): void
    {
        $post = $this->createPost();

        $request = $this->request('POST', ['kizlo' => ['seo' => [
            'title' => 'Never Stored',
            'og'    => ['image_id' => 99999],
        ]]]);

        $this->assertInstanceOf(WP_Error::class, $this->validate($request));

        // Validation runs before the route callback, so the write hook never fires
        // and nothing from the payload reaches meta.
        $this->assertSame('', $this->meta($post->ID, 'title'));
        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_an_anonymous_caller_is_left_to_the_route_permission_check(): void
    {
        $image = $this->createImage();
        wp_set_current_user(0);

        // `rest_request_before_callbacks` runs before the route's
        // permission_callback. Answering 400 for an ID that is not an image and
        // letting a real one through would tell a logged-out caller which
        // attachment IDs exist, so neither payload may be inspected here.
        $this->assertNull($this->validate($this->request('POST', ['kizlo' => ['seo' => [
            'og' => ['image_id' => 99999],
        ]]])));

        $this->assertNull($this->validate($this->request('POST', ['kizlo' => ['seo' => [
            'og' => ['image_id' => $image],
        ]]])));
    }

    // ============================================================
    // PERSISTENCE, ONCE THE ROW EXISTS
    // ============================================================

    public function test_a_core_route_write_is_not_a_second_authoring_path(): void
    {
        $post = $this->createPost([], ['title' => 'Stored Title']);

        // The insert hooks are keyed on post type, so they fire for core's own
        // routes too. Those never declare `kizlo`, so nothing validated this
        // payload and it must not be written.
        $core = new WP_REST_Request('POST', '/wp/v2/posts');
        $core->set_param('kizlo', ['seo' => ['title' => 'Via Core Route', 'titel' => 'typo']]);

        (new SeoModule())->register();
        do_action('rest_after_insert_post', $post, $core);

        $this->assertSame('Stored Title', $this->meta($post->ID, 'title'));
    }

    public function test_the_insert_hook_persists_the_submitted_values(): void
    {
        $post = $this->createPost();

        (new SeoModule())->register();
        do_action('rest_after_insert_post', $post, $this->request('POST', ['kizlo' => ['seo' => [
            'title'        => 'Custom Title',
            'description'  => 'Custom description.',
            'canonical'    => 'https://example.com/custom',
            'webpage_type' => 'AboutPage',
            'article_type' => 'NewsArticle',
            'noindex'      => true,
            'nofollow'     => false,
            'og'           => ['title' => 'OG Title', 'description' => 'OG description.'],
            'twitter'      => ['title' => 'Twitter Title'],
        ]]]));

        $this->assertSame('Custom Title', $this->meta($post->ID, 'title'));
        $this->assertSame('Custom description.', $this->meta($post->ID, 'description'));
        $this->assertSame('https://example.com/custom', $this->meta($post->ID, 'canonical'));
        $this->assertSame('AboutPage', $this->meta($post->ID, 'webpage_type'));
        $this->assertSame('NewsArticle', $this->meta($post->ID, 'article_type'));
        $this->assertSame('1', $this->meta($post->ID, 'noindex'));
        $this->assertSame('OG Title', $this->meta($post->ID, 'og_title'));
        $this->assertSame('OG description.', $this->meta($post->ID, 'og_description'));
        $this->assertSame('Twitter Title', $this->meta($post->ID, 'twitter_title'));

        // A false boolean is stored as absence, the same way the meta box has
        // always stored an unchecked box.
        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['nofollow']));
    }

    public function test_an_update_leaves_unsubmitted_keys_untouched(): void
    {
        $post = $this->createPost([], ['title' => 'Stored Title', 'description' => 'Stored description.']);

        (new SeoModule())->register();
        do_action('rest_after_insert_post', $post, $this->request('PATCH', ['kizlo' => ['seo' => [
            'title' => 'New Title',
        ]]]));

        $this->assertSame('New Title', $this->meta($post->ID, 'title'), 'The submitted field is updated.');
        $this->assertSame('Stored description.', $this->meta($post->ID, 'description'), 'The omitted field keeps its stored value.');
    }

    public function test_an_empty_value_deletes_its_key(): void
    {
        $post = $this->createPost([], ['title' => 'Stored Title']);

        (new SeoModule())->register();
        do_action('rest_after_insert_post', $post, $this->request('PATCH', ['kizlo' => ['seo' => ['title' => '']]]));

        $this->assertFalse(
            metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']),
            'The key is removed so the post falls back to its post-type template.'
        );
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

        $over_rest = $this->createPost();
        (new SeoModule())->register();
        do_action('rest_after_insert_post', $over_rest, $this->request('POST', ['kizlo' => ['seo' => $payload]]));

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
            SeoOverridesStore::read(SeoOverridesStore::META_POST, $over_rest->ID),
            'The two authoring paths share one store, so the same payload stores the same meta.'
        );
    }

    public function test_a_literal_zero_is_stored_rather_than_treated_as_empty(): void
    {
        $post = $this->createPost([], ['title' => 'Stored Title']);

        (new SeoModule())->register();
        do_action('rest_after_insert_post', $post, $this->request('PATCH', ['kizlo' => ['seo' => ['title' => '0']]]));

        // "0" is a value, not an absence: only an empty value clears an override.
        $this->assertSame('0', $this->meta($post->ID, 'title'));
        $this->assertTrue(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_a_non_scalar_value_stores_nothing(): void
    {
        $post = $this->createPost([], ['title' => 'Stored Title']);

        (new SeoModule())->register();
        do_action('rest_after_insert_post', $post, $this->request('PATCH', ['kizlo' => ['seo' => [
            'title'     => ['nested'],
            'canonical' => ['nested'],
        ]]]));

        // WordPress's own sanitizers answer '' for an array; casting first would
        // have stored the literal string "Array".
        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']));
        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['canonical']));
    }

    // ============================================================
    // TERMS
    // ============================================================

    public function test_terms_accept_the_shared_surface(): void
    {
        $term_id = self::factory()->term->create(['taxonomy' => 'category']);

        $request = $this->termRequest('POST', ['kizlo' => ['seo' => [
            'title'   => 'Term Title',
            'noindex' => true,
            'og'      => ['title' => 'Term OG Title'],
        ]]]);

        $this->assertNull($this->validate($request));

        (new SeoModule())->register();
        do_action('rest_after_insert_category', get_term($term_id), $request);

        $this->assertSame('Term Title', get_term_meta($term_id, SeoBase::OVERRIDE_KEYS['title'], true));
        $this->assertSame('1', get_term_meta($term_id, SeoBase::OVERRIDE_KEYS['noindex'], true));
        $this->assertSame('Term OG Title', get_term_meta($term_id, SeoBase::OVERRIDE_KEYS['og_title'], true));
    }

    public function test_an_empty_value_deletes_its_term_key(): void
    {
        $term_id = self::factory()->term->create(['taxonomy' => 'category']);
        $this->applyTermOverrides($term_id, ['title' => 'Stored Title']);

        (new SeoModule())->register();
        do_action('rest_after_insert_category', get_term($term_id), $this->termRequest('PATCH', [
            'kizlo' => ['seo' => ['title' => '']],
        ]));

        $this->assertFalse(metadata_exists('term', $term_id, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_the_post_only_type_fields_never_reach_term_meta(): void
    {
        $term_id = self::factory()->term->create(['taxonomy' => 'category']);

        (new SeoModule())->register();
        do_action('rest_after_insert_category', get_term($term_id), $this->termRequest('POST', [
            'kizlo' => ['seo' => ['webpage_type' => 'AboutPage', 'article_type' => 'NewsArticle']],
        ]));

        // The term schema does not declare them and the store does not carry them,
        // so a payload that gets past the schema still writes nothing.
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
}
