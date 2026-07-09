<?php

namespace Kizlo\Tests\Seo;

use Kizlo\Modules\Post\PostSchema;

/**
 * Head metadata resolution for a post: the title/description/canonical fallback
 * chain, robots flags across the three ways a page goes noindex, and the
 * Open Graph / Twitter layering (twitter falls back to og falls back to base).
 */
class PostSchemaMetaTest extends SeoTestCase
{
    public function test_title_and_description_resolve_from_post_type_structure(): void
    {
        $settings = $this->seedSettings();
        $post     = $this->createPost(['post_title' => 'Hello World']);

        $meta = (new PostSchema($settings))->buildMeta($post);

        // Default structure: "{{title}} {{separator}} {{site_name}}".
        $this->assertSame('Hello World | Example Site', $meta['title']);
        $this->assertSame('https://example.com/hello-world/', $meta['canonical']);
    }

    public function test_custom_title_structure_is_honoured(): void
    {
        $settings = $this->seedSettings([
            'post_types' => ['post' => ['title_structure' => '{{title}} on {{site_name}}']],
        ]);
        $post = $this->createPost(['post_title' => 'Launch Day']);

        $this->assertSame('Launch Day on Example Site', (new PostSchema($settings))->buildMeta($post)['title']);
    }

    public function test_per_post_override_beats_post_type_default(): void
    {
        $settings = $this->seedSettings();
        $post     = $this->createPost(['post_title' => 'Original'], [
            'title'       => 'Overridden Title',
            'description' => 'Overridden description.',
            'canonical'   => 'https://example.com/elsewhere',
        ]);

        $meta = (new PostSchema($settings))->buildMeta($post);

        $this->assertSame('Overridden Title', $meta['title']);
        $this->assertSame('https://example.com/elsewhere/', $meta['canonical']);
    }

    public function test_robots_indexable_by_default(): void
    {
        $settings = $this->seedSettings();
        $meta     = (new PostSchema($settings))->buildMeta($this->createPost());

        $this->assertSame('index', $meta['robots']['index']);
        $this->assertSame('follow', $meta['robots']['follow']);
    }

    public function test_per_post_noindex_and_nofollow_flip_robots(): void
    {
        $settings = $this->seedSettings();
        $post     = $this->createPost([], ['noindex' => '1', 'nofollow' => '1']);

        $meta = (new PostSchema($settings))->buildMeta($post);

        $this->assertSame('noindex', $meta['robots']['index']);
        $this->assertSame('nofollow', $meta['robots']['follow']);
    }

    public function test_post_type_search_engine_visibility_off_forces_noindex(): void
    {
        $settings = $this->seedSettings([
            'post_types' => ['post' => ['search_engine_visibility' => false]],
        ]);

        $meta = (new PostSchema($settings))->buildMeta($this->createPost());

        $this->assertSame('noindex', $meta['robots']['index']);
    }

    public function test_open_graph_falls_back_to_seo_title_and_featured_image(): void
    {
        $thumb    = $this->createImage(['alt' => 'Cover']);
        $settings = $this->seedSettings();
        $post     = $this->createPost(['post_title' => 'OG Post', 'thumbnail_id' => $thumb]);

        $og = (new PostSchema($settings))->buildMeta($post)['og'];

        $this->assertSame('article', $og['type']);
        $this->assertSame('OG Post | Example Site', $og['title']);
        $this->assertSame('https://example.com/og-post/', $og['url']);
        $this->assertStringContainsString('example-image.jpg', $og['image']['url']);
        $this->assertSame(1200, $og['image']['width']);
    }

    public function test_open_graph_falls_back_to_site_fallback_image_without_featured(): void
    {
        $fallback = $this->createImage(['file' => '2026/07/fallback.jpg', 'alt' => 'Fallback']);
        $settings = $this->seedSettings(['site' => ['fallback_image' => $fallback]]);
        $post     = $this->createPost(['post_title' => 'No Thumb']);

        $og = (new PostSchema($settings))->buildMeta($post)['og'];

        // No featured image and no override, so the base image is the site fallback.
        $this->assertStringContainsString('fallback.jpg', $og['image']['url']);
        $this->assertSame('summary_large_image', (new PostSchema($settings))->buildMeta($post)['twitter']['card']);
    }

    public function test_featured_image_beats_site_fallback_image(): void
    {
        $fallback = $this->createImage(['file' => '2026/07/fallback.jpg']);
        $thumb    = $this->createImage(['file' => '2026/07/featured.jpg']);
        $settings = $this->seedSettings(['site' => ['fallback_image' => $fallback]]);
        $post     = $this->createPost(['thumbnail_id' => $thumb]);

        $og = (new PostSchema($settings))->buildMeta($post)['og'];

        $this->assertStringContainsString('featured.jpg', $og['image']['url']);
    }

    public function test_twitter_falls_back_to_open_graph_then_base(): void
    {
        $settings = $this->seedSettings();
        // Only the OG title is overridden; Twitter has nothing of its own and must
        // inherit the OG title, which itself was set explicitly here.
        $post = $this->createPost(['post_title' => 'Base'], ['og_title' => 'OG Level Title']);

        $meta = (new PostSchema($settings))->buildMeta($post);

        $this->assertSame('OG Level Title', $meta['og']['title']);
        $this->assertSame('OG Level Title', $meta['twitter']['title']);
    }

    public function test_per_network_overrides_layer_on_top(): void
    {
        $og_image = $this->createImage(['file' => '2026/07/og.jpg', 'alt' => 'OG alt']);
        $tw_image = $this->createImage(['file' => '2026/07/tw.jpg', 'alt' => 'TW alt']);

        $settings = $this->seedSettings();
        $post     = $this->createPost([], [
            'og_title'         => 'OG Title',
            'og_image_id'      => $og_image,
            'twitter_title'    => 'TW Title',
            'twitter_image_id' => $tw_image,
        ]);

        $meta = (new PostSchema($settings))->buildMeta($post);

        $this->assertSame('OG Title', $meta['og']['title']);
        $this->assertStringContainsString('og.jpg', $meta['og']['image']['url']);
        $this->assertSame('TW Title', $meta['twitter']['title']);
        $this->assertStringContainsString('tw.jpg', $meta['twitter']['image']);
        $this->assertSame('TW alt', $meta['twitter']['image_alt']);
    }

    public function test_twitter_card_type_depends_on_image_presence(): void
    {
        $settings = $this->seedSettings();

        $without = (new PostSchema($settings))->buildMeta($this->createPost());
        $this->assertSame('summary', $without['twitter']['card']);

        $with = (new PostSchema($settings))->buildMeta(
            $this->createPost(['thumbnail_id' => $this->createImage()])
        );
        $this->assertSame('summary_large_image', $with['twitter']['card']);
    }

    public function test_twitter_handle_is_derived_from_identity_social_profiles(): void
    {
        $settings = $this->seedSettings([
            'organization' => [
                'name'            => 'Example Org',
                'social_profiles' => [['platform' => 'x', 'url' => 'https://x.com/exampleorg']],
            ],
        ]);

        $meta = (new PostSchema($settings))->buildMeta($this->createPost());

        $this->assertSame('@exampleorg', $meta['twitter']['site']);
        $this->assertSame('@exampleorg', $meta['twitter']['creator']);
    }

    public function test_article_block_present_for_article_type_and_populated(): void
    {
        $settings = $this->seedSettings();
        $author   = self::factory()->user->create(['role' => 'author', 'display_name' => 'Ada Byron']);
        $category = self::factory()->category->create(['name' => 'Science']);
        $post     = $this->createPost(['post_author' => $author, 'post_category' => [$category]]);

        wp_set_post_tags($post->ID, ['alpha', 'beta']);

        $meta = (new PostSchema($settings))->buildMeta($post);

        $this->assertNotNull($meta['article']);
        $this->assertSame('Ada Byron', $meta['article']['author']);
        $this->assertSame('Science', $meta['article']['section']);
        $this->assertEqualsCanonicalizing(['alpha', 'beta'], $meta['article']['tags']);
        $this->assertNotEmpty($meta['article']['published_time']);
    }

    public function test_article_block_absent_when_type_is_none(): void
    {
        $settings = $this->seedSettings(['post_types' => ['post' => ['article_type' => 'none']]]);

        $this->assertNull((new PostSchema($settings))->buildMeta($this->createPost())['article']);
    }

    public function test_per_post_article_type_override_enables_the_block(): void
    {
        // Page defaults to article_type "none"; a per-post override opts a single
        // page into an Article type.
        $settings = $this->seedSettings();
        $page     = $this->createPost(['post_type' => 'page'], ['article_type' => 'NewsArticle']);

        $this->assertNotNull((new PostSchema($settings))->buildMeta($page)['article']);
    }
}
