<?php

namespace Kizlo\Tests\Seo;

use ReflectionMethod;
use Kizlo\Modules\Seo\SeoBase;
use Kizlo\Modules\Seo\SeoMetaBox;
use Kizlo\Modules\Post\PostSchema;

/**
 * The per-post override meta box: what it persists, the guards that stop it, and
 * how it shapes stored overrides + resolved defaults for the editor.
 */
class SeoMetaBoxTest extends SeoTestCase
{
    private const ACTION = 'kizlo_seo_save';
    private const NONCE  = 'kizlo_seo_nonce';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedSettings();
    }

    /**
     * Drive SeoMetaBox::save() the way a real submit would: an authorised user, a
     * valid nonce, and the override payload in the (slashed) `kizlo_seo` field.
     *
     * @param array<string, mixed> $payload
     */
    private function submit(int $post_id, array $payload, bool $valid_nonce = true): void
    {
        $this->actingAsAdmin();

        $_POST[self::NONCE] = $valid_nonce ? wp_create_nonce(self::ACTION) : 'bogus';
        $_POST['kizlo_seo'] = wp_slash(wp_json_encode($payload));

        (new SeoMetaBox())->save($post_id);

        unset($_POST[self::NONCE], $_POST['kizlo_seo']);
    }

    public function test_persists_only_populated_overrides(): void
    {
        $post = $this->createPost();

        $this->submit($post->ID, [
            'title'       => 'Custom Title',
            'description' => 'Custom description.',
            'noindex'     => true,
            'nofollow'    => false,
        ]);

        $this->assertSame('Custom Title', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['title'], true));
        $this->assertSame('Custom description.', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['description'], true));
        $this->assertSame('1', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['noindex'], true));

        // An unchecked boolean and every unsent field stay absent so the post
        // keeps inheriting the post-type default.
        $this->assertSame('', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['nofollow'], true));
        $this->assertSame('', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['canonical'], true));
    }

    public function test_clearing_a_field_deletes_the_meta_key(): void
    {
        $post = $this->createPost([], ['title' => 'Was Overridden']);
        $this->assertSame('Was Overridden', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['title'], true));

        // Resubmitting with an empty title must remove the key entirely, not store "".
        $this->submit($post->ID, ['title' => '']);

        $this->assertSame('', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['title'], true));
        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_sanitizes_fields_on_save(): void
    {
        $post = $this->createPost();

        $this->submit($post->ID, [
            'title'        => '  Spaced  <b>Title</b>  ',
            'canonical'    => 'https://example.com/custom canonical',
            'og_image_id'  => '42abc',
            'webpage_type' => 'AboutPage',
        ]);

        // sanitize_text_field strips tags and trims.
        $this->assertSame('Spaced Title', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['title'], true));
        // esc_url_raw encodes the space.
        $this->assertStringContainsString('%20', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['canonical'], true));
        // absint coerces to the leading integer.
        $this->assertSame('42', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['og_image_id'], true));
        $this->assertSame('AboutPage', get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS['webpage_type'], true));
    }

    public function test_invalid_nonce_skips_the_save(): void
    {
        $post = $this->createPost();

        $this->submit($post->ID, ['title' => 'Should Not Save'], valid_nonce: false);

        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_missing_nonce_skips_the_save(): void
    {
        $post = $this->createPost();
        $this->actingAsAdmin();

        // No nonce field at all.
        $_POST['kizlo_seo'] = wp_slash(wp_json_encode(['title' => 'Should Not Save']));
        (new SeoMetaBox())->save($post->ID);
        unset($_POST['kizlo_seo']);

        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_revision_is_not_written(): void
    {
        $post     = $this->createPost();
        $revision = self::factory()->post->create([
            'post_type'   => 'revision',
            'post_status' => 'inherit',
            'post_parent' => $post->ID,
            'post_name'   => "{$post->ID}-revision-v1",
        ]);

        $this->submit($revision, ['title' => 'Revision Title']);

        $this->assertFalse(metadata_exists('post', $revision, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_user_without_edit_capability_cannot_save(): void
    {
        $post = $this->createPost();

        $subscriber = self::factory()->user->create(['role' => 'subscriber']);
        wp_set_current_user($subscriber);

        $_POST[self::NONCE] = wp_create_nonce(self::ACTION);
        $_POST['kizlo_seo'] = wp_slash(wp_json_encode(['title' => 'No Permission']));
        (new SeoMetaBox())->save($post->ID);
        unset($_POST[self::NONCE], $_POST['kizlo_seo']);

        $this->assertFalse(metadata_exists('post', $post->ID, SeoBase::OVERRIDE_KEYS['title']));
    }

    public function test_get_meta_groups_social_fields_and_resolves_image_previews(): void
    {
        $og_image = $this->createImage(['alt' => 'OG alt']);
        $post     = $this->createPost([], [
            'title'        => 'Meta Title',
            'noindex'      => '1',
            'og_title'     => 'Shared Title',
            'og_image_id'  => $og_image,
        ]);

        $meta = $this->callGetMeta($post->ID);

        $this->assertSame('Meta Title', $meta['title']);
        $this->assertTrue($meta['noindex']);
        $this->assertFalse($meta['nofollow']);
        $this->assertSame('Shared Title', $meta['og']['title']);
        $this->assertSame($og_image, $meta['og']['image']['id']);
        $this->assertStringContainsString('example-image.jpg', $meta['og']['image']['url']);
        // No Twitter image was set, so that preview stays null.
        $this->assertNull($meta['twitter']['image']);
    }

    public function test_seo_defaults_seed_placeholders_from_post_type_structure(): void
    {
        $thumb = $this->createImage();
        $post  = $this->createPost(['post_title' => 'Defaults Post', 'thumbnail_id' => $thumb]);

        $defaults = (new PostSchema($this->seedSettings()))->seoDefaults($post);

        $this->assertSame('Defaults Post | Example Site', $defaults['title']);
        $this->assertSame('https://example.com/defaults-post/', $defaults['canonical']);
        $this->assertTrue($defaults['indexable']);
        $this->assertSame('WebPage', $defaults['webpage_type']);
        $this->assertSame('Article', $defaults['article_type']);
        $this->assertSame($thumb, $defaults['og_image']['id']);
    }

    /**
     * @return array<string, mixed>
     */
    private function callGetMeta(int $post_id): array
    {
        $method = new ReflectionMethod(SeoMetaBox::class, 'getMeta');
        $method->setAccessible(true);

        return $method->invoke(new SeoMetaBox(), get_post($post_id));
    }
}
