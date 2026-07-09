<?php

namespace Kizlo\Tests\Seo;

use Kizlo\Modules\Seo\SeoBase;
use Kizlo\Modules\Seo\TermSchema;

/**
 * The sitemap index (which top-level sitemaps exist and their page counts) and the
 * robots ruleset. Both are driven by per-object visibility and the noindex overrides
 * that must keep the index count aligned with the actual indexable posts.
 */
class SitemapIndexTest extends SeoTestCase
{
    /** @return array<string, array<string, mixed>> keyed by entry key */
    private function indexByKey(array $entries): array
    {
        $out = [];
        foreach ($entries as $entry) {
            $out[$entry['key']] = $entry;
        }
        return $out;
    }

    public function test_visible_post_type_with_posts_gets_an_entry(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');
        $this->createPost();

        $entries = $this->indexByKey((new SeoBase($settings))->sitemapIndex());

        $this->assertArrayHasKey('post', $entries);
        $this->assertSame('post_type', $entries['post']['type']);
        $this->assertSame(1, $entries['post']['pages']);
    }

    public function test_invisible_post_type_is_omitted(): void
    {
        $settings = $this->seedSettings(['post_types' => ['post' => ['search_engine_visibility' => false]]]);
        $this->createPost();

        $this->assertArrayNotHasKey('post', $this->indexByKey((new SeoBase($settings))->sitemapIndex()));
    }

    public function test_all_noindexed_type_without_a_front_entry_drops_out(): void
    {
        $settings = $this->seedSettings();

        // Static front page, no assigned posts page: the post type carries no front
        // entry, so once its only post is noindexed the whole sitemap drops.
        $front = $this->createPost(['post_type' => 'page', 'post_title' => 'Front']);
        update_option('show_on_front', 'page');
        update_option('page_on_front', $front->ID);
        update_option('page_for_posts', 0);

        $this->createPost(['post_title' => 'Hidden'], ['noindex' => '1']);

        $entries = $this->indexByKey((new SeoBase($settings))->sitemapIndex());

        $this->assertArrayNotHasKey('post', $entries);
        // The page type still carries the (indexable) homepage.
        $this->assertArrayHasKey('page', $entries);
    }

    public function test_taxonomy_with_used_terms_gets_an_entry(): void
    {
        $settings = $this->seedSettings();
        $category = self::factory()->category->create(['name' => 'Used', 'slug' => 'used']);
        $post     = $this->createPost();
        wp_set_post_terms($post->ID, [$category], 'category');

        $entries = $this->indexByKey((new SeoBase($settings))->sitemapIndex());

        $this->assertArrayHasKey('category', $entries);
        $this->assertSame('taxonomy', $entries['category']['type']);
    }

    public function test_taxonomy_drops_when_all_its_terms_are_noindexed(): void
    {
        // Per-term noindex overrides are excluded from the taxonomy count, mirroring
        // per-post noindex: a taxonomy whose only term is noindexed drops out of the
        // index rather than linking a sitemap that would list nothing.
        $settings = $this->seedSettings();
        $term     = get_term(self::factory()->category->create(['name' => 'Hidden', 'slug' => 'hidden']), 'category');
        $post     = $this->createPost();
        wp_set_post_terms($post->ID, [$term->term_id], 'category');
        update_term_meta($term->term_id, SeoBase::OVERRIDE_KEYS['noindex'], '1');

        $this->assertArrayNotHasKey('category', $this->indexByKey((new SeoBase($settings))->sitemapIndex()));
    }

    public function test_noindexed_terms_are_excluded_from_entries(): void
    {
        $settings = $this->seedSettings();
        $visible  = get_term(self::factory()->category->create(['name' => 'Visible', 'slug' => 'visible']), 'category');
        $hidden   = get_term(self::factory()->category->create(['name' => 'Hidden', 'slug' => 'hidden']), 'category');
        $post     = $this->createPost();
        wp_set_post_terms($post->ID, [$visible->term_id, $hidden->term_id], 'category');
        update_term_meta($hidden->term_id, SeoBase::OVERRIDE_KEYS['noindex'], '1');

        $locs = array_column((new TermSchema($settings))->sitemapEntries('category'), 'loc');

        $this->assertContains('https://example.com/category/visible/', $locs);
        $this->assertNotContains('https://example.com/category/hidden/', $locs);
    }

    public function test_author_entry_present_when_enabled_and_visible(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true, 'search_engine_visibility' => true]]);
        $author   = self::factory()->user->create(['role' => 'author']);
        $this->createPost(['post_author' => $author]);

        $entries = $this->indexByKey((new SeoBase($settings))->sitemapIndex());

        $this->assertArrayHasKey('authors', $entries);
        $this->assertSame('author', $entries['authors']['type']);
    }

    public function test_author_entry_absent_when_disabled(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => false]]);

        $this->assertArrayNotHasKey('authors', $this->indexByKey((new SeoBase($settings))->sitemapIndex()));
    }

    public function test_author_entry_absent_when_no_author_has_published(): void
    {
        // The index counts only authors with published posts (the population the
        // author sitemap lists) — a site of registered users with no posts has none.
        $settings = $this->seedSettings(['authors' => ['enabled' => true, 'search_engine_visibility' => true]]);
        self::factory()->user->create(['role' => 'subscriber']);

        $this->assertArrayNotHasKey('authors', $this->indexByKey((new SeoBase($settings))->sitemapIndex()));
    }

    public function test_robots_defaults_allow_root_and_include_sitemap(): void
    {
        $settings = $this->seedSettings();

        $robots = (new SeoBase($settings))->robots();

        $this->assertSame('*', $robots['rules'][0]['user_agent']);
        $this->assertSame(['/'], $robots['rules'][0]['allow']);
        $this->assertSame(['https://example.com/sitemap_index.xml'], $robots['sitemaps']);
    }

    public function test_robots_does_not_disallow_hidden_collections(): void
    {
        // Hidden collections are deindexed via per-URL noindex + sitemap omission,
        // not a robots.txt path Disallow (which would over-block nested siblings).
        $settings = $this->seedSettings([
            'post_types' => ['post' => ['search_engine_visibility' => false, 'pathname_structure' => '/blog/{{slug}}']],
        ]);

        $this->assertSame([], (new SeoBase($settings))->robots()['rules'][0]['disallow']);
    }

    public function test_robots_omits_sitemap_when_disabled(): void
    {
        $settings = $this->seedSettings(['robots' => ['include_sitemap' => false]]);

        $this->assertArrayNotHasKey('sitemaps', (new SeoBase($settings))->robots());
    }

    public function test_custom_rules_replace_the_default_ruleset(): void
    {
        $custom   = [['user_agent' => 'Googlebot', 'rule' => 'disallow', 'path' => '/private']];
        $settings = $this->seedSettings(['robots' => ['custom_rules' => $custom]]);

        $rules = (new SeoBase($settings))->robots()['rules'];

        // Custom rules are the complete ruleset; the default group is dropped.
        $this->assertSame([['user_agent' => 'Googlebot', 'allow' => [], 'disallow' => ['/private']]], $rules);
    }
}
