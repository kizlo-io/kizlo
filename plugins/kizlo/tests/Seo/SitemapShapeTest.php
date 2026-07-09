<?php

namespace Kizlo\Tests\Seo;

use Kizlo\Modules\Seo\SeoBase;
use Kizlo\Modules\Seo\TermSchema;
use Kizlo\Modules\Seo\AuthorSchema;
use Kizlo\Modules\Post\PostSchema;

/**
 * Shape contract for the sitemap index, the per-object sitemap URL entries, and the
 * robots ruleset. These feed the sitemap XML and robots.txt the web layer renders.
 *
 * Entries are asserted as complete objects; the only value recomputed and embedded
 * (rather than hardcoded) is `lastmod`, which is a real post/term modification
 * timestamp, plus attachment/avatar image URLs which resolve against the test host.
 */
class SitemapShapeTest extends SeoTestCase
{
    // ====================================================
    // SITEMAP INDEX
    // ====================================================

    public function test_sitemap_index_entry_is_full_object(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');
        $this->createPost();

        $entries = (new SeoBase($settings))->sitemapIndex();
        $post    = $entries[array_search('post', array_column($entries, 'key'), true)];

        $this->assertNotEmpty($post['lastmod']);
        $this->assertSame([
            'key'     => 'post',
            'type'    => 'post_type',
            'pages'   => 1,
            'lastmod' => $post['lastmod'],
        ], $post);
    }

    public function test_sitemap_index_type_tags_across_families(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true, 'search_engine_visibility' => true]]);
        update_option('show_on_front', 'posts');

        $author   = self::factory()->user->create(['role' => 'author']);
        $post     = $this->createPost(['post_author' => $author]);
        $category = self::factory()->category->create(['name' => 'Used', 'slug' => 'used']);
        wp_set_post_terms($post->ID, [$category], 'category');

        $types = array_column((new SeoBase($settings))->sitemapIndex(), 'type', 'key');

        // Taxonomy entries are keyed by the taxonomy slug, not the term slug.
        $this->assertSame('post_type', $types['post']);
        $this->assertSame('taxonomy', $types['category']);
        $this->assertSame('author', $types['authors']);
    }

    // ====================================================
    // POST SITEMAP ENTRIES
    // ====================================================

    public function test_post_sitemap_entry_is_full_object_with_images(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');

        $thumb = $this->createImage(['file' => '2026/07/featured.jpg']);
        $this->createPost([
            'post_title'   => 'Illustrated',
            'post_content' => 'Intro <img src="https://cdn.example.com/inline.jpg" alt="Inline"> outro.',
            'thumbnail_id' => $thumb,
        ]);

        $entries = (new PostSchema($settings))->sitemapEntries('post');
        $locs    = array_column($entries, 'loc');
        $entry   = $entries[array_search('https://example.com/illustrated/', $locs, true)];

        $this->assertNotEmpty($entry['lastmod']);
        $this->assertSame([
            'loc'     => 'https://example.com/illustrated/',
            'lastmod' => $entry['lastmod'],
            // Featured image first (with the post title), then content images (no title).
            'images'  => [
                ['loc' => wp_get_attachment_url($thumb), 'title' => 'Illustrated'],
                ['loc' => 'https://cdn.example.com/inline.jpg', 'title' => null],
            ],
        ], $entry);
    }

    public function test_injected_front_entry_is_full_object(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');

        // No posts: only the injected blog-index entry comes back.
        $entries = (new PostSchema($settings))->sitemapEntries('post');

        $this->assertCount(1, $entries);
        $this->assertNotEmpty($entries[0]['lastmod']);
        $this->assertSame([
            'loc'     => 'https://example.com/',
            'lastmod' => $entries[0]['lastmod'],
            'images'  => [],
        ], $entries[0]);
    }

    // ====================================================
    // TERM SITEMAP ENTRIES
    // ====================================================

    public function test_term_sitemap_entry_is_full_object(): void
    {
        $settings = $this->seedSettings();
        $term     = get_term(self::factory()->category->create(['name' => 'Active', 'slug' => 'active']), 'category');
        $post     = $this->createPost();
        wp_set_post_terms($post->ID, [$term->term_id], 'category');

        $entries = (new TermSchema($settings))->sitemapEntries('category');
        $entry   = $entries[array_search('https://example.com/category/active/', array_column($entries, 'loc'), true)];

        $this->assertNotEmpty($entry['lastmod']);
        $this->assertSame([
            'loc'     => 'https://example.com/category/active/',
            'lastmod' => $entry['lastmod'],
            'images'  => [],
        ], $entry);
    }

    // ====================================================
    // AUTHOR SITEMAP ENTRIES
    // ====================================================

    public function test_author_sitemap_entry_is_full_object_with_avatar(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);
        $author   = self::factory()->user->create(['role' => 'author', 'user_login' => 'writer', 'display_name' => 'Writer']);
        $this->createPost(['post_author' => $author]);

        $entries = (new AuthorSchema($settings))->sitemapEntries();
        $entry   = $entries[array_search('https://example.com/author/writer/', array_column($entries, 'loc'), true)];

        $this->assertNotEmpty($entry['lastmod']);
        $this->assertSame([
            'loc'     => 'https://example.com/author/writer/',
            'lastmod' => $entry['lastmod'],
            'images'  => [['loc' => get_avatar_url($author, ['size' => 96]), 'title' => 'Writer']],
        ], $entry);
    }

    // ====================================================
    // ROBOTS RULESET
    // ====================================================

    public function test_robots_default_ruleset_is_full_object(): void
    {
        // The generated ruleset is a single allow-root group. Hidden collections
        // are handled per-URL (noindex + sitemap omission), never as a Disallow.
        $robots = (new SeoBase($this->seedSettings()))->robots();

        $this->assertSame([
            'rules'    => [['user_agent' => '*', 'allow' => ['/'], 'disallow' => []]],
            'sitemaps' => ['https://example.com/sitemaps/index.xml'],
        ], $robots);
    }

    public function test_robots_omits_sitemaps_when_disabled(): void
    {
        $robots = (new SeoBase($this->seedSettings(['robots' => ['include_sitemap' => false]])))->robots();

        $this->assertSame([
            'rules' => [['user_agent' => '*', 'allow' => ['/'], 'disallow' => []]],
        ], $robots);
    }

    public function test_robots_custom_rules_replace_the_default_ruleset(): void
    {
        // "Allow only Googlebot, block everyone else" — only expressible when
        // custom rules replace the default group (a baseline Allow: / merged into
        // the `*` group would win ties and defeat the intended Disallow: /).
        $custom = [
            ['user_agent' => 'Googlebot', 'rule' => 'allow', 'path' => '/'],
            ['user_agent' => '*', 'rule' => 'disallow', 'path' => '/'],
        ];

        $robots = (new SeoBase($this->seedSettings(['robots' => ['custom_rules' => $custom]])))->robots();

        $this->assertSame([
            'rules'    => [
                ['user_agent' => 'Googlebot', 'allow' => ['/'], 'disallow' => []],
                ['user_agent' => '*', 'allow' => [], 'disallow' => ['/']],
            ],
            'sitemaps' => ['https://example.com/sitemaps/index.xml'],
        ], $robots);
    }

    public function test_robots_never_disallows_hidden_collections(): void
    {
        // Hiding every collection produces no Disallow lines — deindexing is a
        // per-URL concern (noindex meta + sitemap omission), so the robots.txt
        // ruleset stays a clean allow-root and never over-blocks by prefix.
        $settings = $this->seedSettings([
            'authors'    => ['enabled' => false, 'search_engine_visibility' => false],
            'post_types' => ['post' => ['search_engine_visibility' => false, 'pathname_structure' => '/blog/{{slug}}']],
            'taxonomies' => ['category' => ['search_engine_visibility' => false]],
        ]);

        $this->assertSame([], (new SeoBase($settings))->robots()['rules'][0]['disallow']);
    }

    public function test_robots_discourage_blocks_everything_and_drops_sitemap(): void
    {
        // The site-wide discourage toggle short-circuits to a blanket disallow
        // and drops the sitemap reference, overriding every per-type rule.
        $robots = (new SeoBase($this->seedSettings(['site' => ['discourage_search_engines' => true]])))->robots();

        $this->assertSame([
            'rules' => [['user_agent' => '*', 'allow' => [], 'disallow' => ['/']]],
        ], $robots);
    }
}
