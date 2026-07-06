<?php

namespace Kizlo\Tests\Seo;

use WP_Post;
use Kizlo\Modules\Seo\SeoMetaBox;
use Kizlo\Modules\Post\PostSchema;

/**
 * Shape contract for the two payloads the editor meta box hands to its React root:
 * the stored overrides (`getMeta`) and the resolved fallbacks (`seoDefaults`). The
 * frontend reads these by key, so their shape is fixed whether or not any override
 * is set and whether or not a preview image resolves.
 */
class EditorShapeTest extends SeoTestCase
{
    private function getMeta(WP_Post $post): array
    {
        return $this->callProtected(new SeoMetaBox(), 'getMeta', [$post]);
    }

    public function test_get_meta_full_object_when_no_overrides_set(): void
    {
        $this->seedSettings();
        $meta = $this->getMeta($this->createPost());

        // Every field empty/false and both previews null: fully deterministic.
        $this->assertSame([
            'title'        => '',
            'description'  => '',
            'canonical'    => '',
            'webpage_type' => '',
            'article_type' => '',
            'noindex'      => false,
            'nofollow'     => false,
            'og'           => ['title' => '', 'description' => '', 'image' => null],
            'twitter'      => ['title' => '', 'description' => '', 'image' => null],
        ], $meta);
    }

    public function test_get_meta_full_object_with_overrides_and_image_preview(): void
    {
        $this->seedSettings();
        $og_image = $this->createImage(['alt' => 'OG alt']);
        $post     = $this->createPost([], [
            'title'       => 'Meta Title',
            'noindex'     => '1',
            'og_title'    => 'Shared Title',
            'og_image_id' => $og_image,
        ]);

        $meta = $this->getMeta($post);

        $this->assertSame([
            'title'        => 'Meta Title',
            'description'  => '',
            'canonical'    => '',
            'webpage_type' => '',
            'article_type' => '',
            'noindex'      => true,
            'nofollow'     => false,
            'og'           => ['title' => 'Shared Title', 'description' => '', 'image' => ['id' => $og_image, 'url' => wp_get_attachment_url($og_image)]],
            'twitter'      => ['title' => '', 'description' => '', 'image' => null],
        ], $meta);
    }

    public function test_seo_defaults_full_object_without_featured_image(): void
    {
        $defaults = (new PostSchema($this->seedSettings()))->seoDefaults($this->createPost());

        // The description falls back to the post-type template (resolves from post
        // content), so embed it; every other field is deterministic.
        $this->assertSame([
            'title'        => 'Hello World | Example Site',
            'description'  => $defaults['description'],
            'canonical'    => 'https://example.com/hello-world/',
            'indexable'    => true,
            'webpage_type' => 'WebPage',
            'article_type' => 'Article',
            'og_image'     => null,
        ], $defaults);
        $this->assertIsString($defaults['description']);
    }

    public function test_seo_defaults_full_object_with_featured_image(): void
    {
        $thumb    = $this->createImage();
        $defaults = (new PostSchema($this->seedSettings()))->seoDefaults(
            $this->createPost(['thumbnail_id' => $thumb])
        );

        $this->assertSame([
            'title'        => 'Hello World | Example Site',
            'description'  => $defaults['description'],
            'canonical'    => 'https://example.com/hello-world/',
            'indexable'    => true,
            'webpage_type' => 'WebPage',
            'article_type' => 'Article',
            'og_image'     => ['id' => $thumb, 'url' => wp_get_attachment_url($thumb)],
        ], $defaults);
    }
}
