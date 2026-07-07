<?php

namespace Kizlo\Tests\Seo;

use WP_Post;
use Kizlo\Modules\Seo\HomeSchema;

/**
 * The homepage, which resolves differently for the two WordPress front-page modes:
 * a latest-posts feed (driven entirely by site settings) versus a static page
 * (which behaves like a post, with its own SEO overrides and article type).
 */
class HomeSchemaTest extends SeoTestCase
{
    private function useLatestPosts(): void
    {
        update_option('show_on_front', 'posts');
        update_option('page_on_front', 0);
    }

    /**
     * @param array<string, mixed> $args
     * @param array<string, mixed> $overrides
     */
    private function useStaticFrontPage(array $args = [], array $overrides = []): WP_Post
    {
        $page = $this->createPost(array_merge(['post_type' => 'page', 'post_title' => 'Welcome'], $args), $overrides);

        update_option('show_on_front', 'page');
        update_option('page_on_front', $page->ID);

        return $page;
    }

    public function test_latest_posts_home_uses_site_identity(): void
    {
        $settings = $this->seedSettings();
        $this->useLatestPosts();

        $meta = (new HomeSchema($settings))->buildMeta();

        $this->assertSame('Example Site', $meta['title']);
        $this->assertSame('The example tagline', $meta['og']['description']);
        $this->assertSame('https://example.com', $meta['canonical']);
        $this->assertSame('website', $meta['og']['type']);
        $this->assertNull($meta['article']);
    }

    public function test_latest_posts_home_is_a_plain_webpage_without_article(): void
    {
        $settings = $this->seedSettings();
        $this->useLatestPosts();

        $graph = (new HomeSchema($settings))->jsonLd()['@graph'];

        $webpage = $this->findNode($graph, 'WebPage');
        $this->assertSame('WebPage', $webpage['@type']);
        $this->assertNull($this->findNode($graph, 'Article'));
    }

    public function test_static_front_page_resolves_title_from_its_structure(): void
    {
        $settings = $this->seedSettings();
        $this->useStaticFrontPage(['post_title' => 'Homepage']);

        $this->assertSame('Homepage | Example Site', (new HomeSchema($settings))->buildMeta()['title']);
    }

    public function test_static_front_page_overrides_win(): void
    {
        $settings = $this->seedSettings();
        $this->useStaticFrontPage([], [
            'title'     => 'Overridden Home',
            'canonical' => 'https://example.com/custom-home',
            'noindex'   => '1',
        ]);

        $meta = (new HomeSchema($settings))->buildMeta();

        $this->assertSame('Overridden Home', $meta['title']);
        $this->assertSame('https://example.com/custom-home/', $meta['canonical']);
        $this->assertSame('noindex', $meta['robots']['index']);
    }

    public function test_static_front_page_article_type_emits_article_anchored_to_home(): void
    {
        $settings = $this->seedSettings();
        $this->useStaticFrontPage([], ['article_type' => 'Article']);

        $article = $this->findNode((new HomeSchema($settings))->jsonLd()['@graph'], 'Article');

        $this->assertNotNull($article);
        $this->assertSame('https://example.com/#article', $article['@id']);
    }

    public function test_static_front_page_article_type_flips_head_to_article(): void
    {
        $settings = $this->seedSettings();
        // A page defaults to article_type "none"; opting the front page into a real
        // Article type makes the head mirror the JSON-LD Article node.
        $this->useStaticFrontPage([], ['article_type' => 'Article']);

        $meta = (new HomeSchema($settings))->buildMeta();

        $this->assertSame('article', $meta['og']['type']);
        $this->assertNotNull($meta['article']);
        $this->assertNotEmpty($meta['article']['published_time']);
    }

    public function test_static_front_page_without_article_type_stays_website(): void
    {
        $settings = $this->seedSettings();
        // A page's default article_type is "none", so the homepage stays a website
        // with no article block.
        $this->useStaticFrontPage();

        $meta = (new HomeSchema($settings))->buildMeta();

        $this->assertSame('website', $meta['og']['type']);
        $this->assertNull($meta['article']);
    }

    public function test_static_front_page_webpage_type_override_applies(): void
    {
        $settings = $this->seedSettings();
        $this->useStaticFrontPage([], ['webpage_type' => 'AboutPage']);

        $webpage = $this->findNode((new HomeSchema($settings))->jsonLd()['@graph'], 'AboutPage');

        $this->assertSame(['WebPage', 'AboutPage'], $webpage['@type']);
    }

    public function test_open_graph_falls_back_to_site_fallback_image(): void
    {
        $fallback = $this->createImage(['file' => '2026/07/fallback.jpg', 'alt' => 'Fallback']);
        $settings = $this->seedSettings(['site' => ['fallback_image' => $fallback]]);
        $this->useLatestPosts();

        $og = (new HomeSchema($settings))->buildMeta()['og'];

        $this->assertStringContainsString('fallback.jpg', $og['image']['url']);
    }

    public function test_front_page_image_override_beats_fallback(): void
    {
        $fallback = $this->createImage(['file' => '2026/07/fallback.jpg']);
        $override = $this->createImage(['file' => '2026/07/override.jpg']);

        $settings = $this->seedSettings(['site' => ['fallback_image' => $fallback]]);
        $this->useStaticFrontPage([], ['og_image_id' => $override]);

        $graph = (new HomeSchema($settings))->jsonLd()['@graph'];
        $image = $this->findNode($graph, 'ImageObject');

        $this->assertSame('https://example.com/#primaryimage', $image['@id']);
        $this->assertStringContainsString('override.jpg', $image['url']);
    }
}
