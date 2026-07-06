<?php

namespace Kizlo\Tests\Seo;

use Kizlo\Modules\Post\PostSchema;

/**
 * Per-post-type sitemap entries: the visibility gate, query-level exclusion of
 * noindexed posts, image extraction, and the injected "front" entry that splits
 * the homepage from the blog index the way Yoast does.
 */
class PostSchemaSitemapTest extends SeoTestCase
{
    /** @return list<string> */
    private function locs(array $entries): array
    {
        return array_column($entries, 'loc');
    }

    public function test_invisible_post_type_returns_no_entries(): void
    {
        $settings = $this->seedSettings(['post_types' => ['post' => ['search_engine_visibility' => false]]]);
        $this->createPost();

        $this->assertSame([], (new PostSchema($settings))->sitemapEntries('post'));
    }

    public function test_noindexed_posts_are_excluded(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');

        $this->createPost(['post_title' => 'Indexable']);
        $this->createPost(['post_title' => 'Hidden'], ['noindex' => '1']);

        $locs = $this->locs((new PostSchema($settings))->sitemapEntries('post'));

        $this->assertContains('https://example.com/indexable/', $locs);
        $this->assertNotContains('https://example.com/hidden/', $locs);
    }

    public function test_post_sitemap_injects_blog_index_on_latest_posts_home(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');

        $entries = (new PostSchema($settings))->sitemapEntries('post');

        // First entry is the blog index, which on a latest-posts home is the site root.
        $this->assertSame('https://example.com/', $entries[0]['loc']);
    }

    public function test_page_sitemap_injects_homepage_and_excludes_static_pages(): void
    {
        $settings = $this->seedSettings();

        $front = $this->createPost(['post_type' => 'page', 'post_title' => 'Front']);
        $posts = $this->createPost(['post_type' => 'page', 'post_title' => 'Blog']);
        $about = $this->createPost(['post_type' => 'page', 'post_title' => 'About']);

        update_option('show_on_front', 'page');
        update_option('page_on_front', $front->ID);
        update_option('page_for_posts', $posts->ID);

        $locs = $this->locs((new PostSchema($settings))->sitemapEntries('page'));

        // The homepage is represented as "/", and the static front + posts pages are
        // dropped from the page listing (they live at "/" and in the post sitemap).
        $this->assertContains('https://example.com/', $locs);
        $this->assertContains('https://example.com/about/', $locs);
        $this->assertNotContains('https://example.com/front/', $locs);
        $this->assertNotContains('https://example.com/blog/', $locs);
    }

    public function test_noindexed_static_front_page_drops_the_homepage_entry(): void
    {
        $settings = $this->seedSettings();

        $front = $this->createPost(['post_type' => 'page', 'post_title' => 'Front'], ['noindex' => '1']);
        update_option('show_on_front', 'page');
        update_option('page_on_front', $front->ID);

        $locs = $this->locs((new PostSchema($settings))->sitemapEntries('page'));

        $this->assertNotContains('https://example.com/', $locs);
    }

    public function test_entries_extract_featured_and_content_images(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');

        $thumb = $this->createImage(['file' => '2026/07/featured.jpg']);
        $post  = $this->createPost([
            'post_title'   => 'Illustrated',
            'post_content' => 'Intro <img src="https://cdn.example.com/inline.jpg" alt="Inline"> outro.',
            'thumbnail_id' => $thumb,
        ]);

        $entries = (new PostSchema($settings))->sitemapEntries('post');
        $entry   = $entries[array_search('https://example.com/illustrated/', $this->locs($entries), true)];

        $image_locs = array_column($entry['images'], 'loc');
        $this->assertContains('https://cdn.example.com/inline.jpg', $image_locs);
        $this->assertNotEmpty(array_filter($image_locs, fn($loc) => str_contains($loc, 'featured.jpg')));
    }

    public function test_pagination_offsets_into_the_result_set(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');
        $this->createPost(['post_title' => 'Only Post']);

        // Page 2 is past the single post, and the injected front entry only rides
        // on page 1, so page 2 comes back empty.
        $this->assertSame([], (new PostSchema($settings))->sitemapEntries('post', 2));
    }
}
