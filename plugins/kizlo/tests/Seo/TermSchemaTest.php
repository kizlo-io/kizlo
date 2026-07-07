<?php

namespace Kizlo\Tests\Seo;

use WP_Term;
use Kizlo\Modules\Seo\TermSchema;

/**
 * Taxonomy term pages: head metadata + canonical, the CollectionPage JSON-LD with
 * its parent-aware breadcrumb, and the visibility-gated sitemap entries.
 */
class TermSchemaTest extends SeoTestCase
{
    private function category(string $name, string $slug, int $parent = 0): WP_Term
    {
        $id = self::factory()->category->create(['name' => $name, 'slug' => $slug, 'parent' => $parent]);

        return get_term($id, 'category');
    }

    public function test_build_meta_resolves_title_description_and_canonical(): void
    {
        $settings = $this->seedSettings();
        $term     = $this->category('News', 'news');

        $meta = (new TermSchema($settings))->buildMeta($term);

        $this->assertSame('News | Example Site', $meta['title']);
        $this->assertSame('https://example.com/category/news/', $meta['canonical']);
        $this->assertSame('index', $meta['robots']['index']);
        $this->assertSame('website', $meta['og']['type']);
    }

    public function test_custom_taxonomy_structures_are_honoured(): void
    {
        $settings = $this->seedSettings([
            'taxonomies' => ['category' => [
                'title_structure'       => 'Browse {{title}}',
                'description_structure' => 'All posts in {{title}}',
            ]],
        ]);
        $term = $this->category('Guides', 'guides');

        $meta = (new TermSchema($settings))->buildMeta($term);

        $this->assertSame('Browse Guides', $meta['title']);
        $this->assertSame('All posts in Guides', $meta['og']['description']);
    }

    public function test_per_term_overrides_win_over_taxonomy_templates(): void
    {
        $settings = $this->seedSettings([
            'taxonomies' => ['category' => ['title_structure' => 'Browse {{title}}']],
        ]);
        $term = $this->category('News', 'news');

        $this->applyTermOverrides($term->term_id, [
            'title'       => 'Hand-written term title',
            'description' => 'Hand-written term description',
            'canonical'   => 'https://example.com/custom-news',
        ]);

        $meta = (new TermSchema($settings))->buildMeta($term);

        $this->assertSame('Hand-written term title', $meta['title']);
        $this->assertSame('Hand-written term description', $meta['og']['description']);
        $this->assertSame('https://example.com/custom-news/', $meta['canonical']);
    }

    public function test_per_term_noindex_override_forces_noindex_on_visible_taxonomy(): void
    {
        $settings = $this->seedSettings();
        $term     = $this->category('News', 'news');

        $this->applyTermOverrides($term->term_id, ['noindex' => '1', 'nofollow' => '1']);

        $robots = (new TermSchema($settings))->buildMeta($term)['robots'];

        $this->assertSame('noindex', $robots['index']);
        $this->assertSame('nofollow', $robots['follow']);
    }

    public function test_twitter_social_falls_back_through_open_graph_to_base(): void
    {
        $settings = $this->seedSettings();
        $term     = $this->category('News', 'news');

        // Only the og title is overridden; twitter has none, so it inherits og,
        // which in turn seeds the base title/description.
        $this->applyTermOverrides($term->term_id, ['og_title' => 'Shared social title']);

        $meta = (new TermSchema($settings))->buildMeta($term);

        $this->assertSame('Shared social title', $meta['og']['title']);
        $this->assertSame('Shared social title', $meta['twitter']['title']);
    }

    public function test_per_term_og_image_override_sets_the_social_image(): void
    {
        $settings = $this->seedSettings();
        $term     = $this->category('News', 'news');
        $image    = $this->createImage(['alt' => 'Term social image']);

        $this->applyTermOverrides($term->term_id, ['og_image_id' => $image]);

        $meta = (new TermSchema($settings))->buildMeta($term);

        $this->assertNotNull($meta['og']['image']);
        $this->assertSame('summary_large_image', $meta['twitter']['card']);
    }

    public function test_invisible_taxonomy_reports_noindex(): void
    {
        $settings = $this->seedSettings(['taxonomies' => ['category' => ['search_engine_visibility' => false]]]);
        $term     = $this->category('Hidden', 'hidden');

        $this->assertSame('noindex', (new TermSchema($settings))->buildMeta($term)['robots']['index']);
    }

    public function test_json_ld_webpage_is_a_collection_page(): void
    {
        $settings = $this->seedSettings();
        $term     = $this->category('News', 'news');

        $webpage = $this->findNode((new TermSchema($settings))->jsonLd($term)['@graph'], 'CollectionPage');

        $this->assertSame(['WebPage', 'CollectionPage'], $webpage['@type']);
        $this->assertSame('https://example.com/category/news/', $webpage['@id']);
    }

    public function test_breadcrumb_reflects_parent_hierarchy(): void
    {
        $settings = $this->seedSettings();
        $parent   = $this->category('Tech', 'tech');
        $child    = $this->category('Phones', 'phones', $parent->term_id);

        $crumb = $this->findNode((new TermSchema($settings))->jsonLd($child)['@graph'], 'BreadcrumbList');
        $items = $crumb['itemListElement'];

        $this->assertSame('Home', $items[0]['name']);
        $this->assertSame('Tech', $items[1]['name']);
        $this->assertSame('Phones', $items[2]['name']);
        $this->assertSame([1, 2, 3], array_column($items, 'position'));
    }

    public function test_sitemap_entries_list_non_empty_terms_with_lastmod(): void
    {
        $settings = $this->seedSettings();
        $term     = $this->category('Active', 'active');

        // hide_empty means only terms with at least one post are listed.
        $post = $this->createPost(['post_title' => 'In Category']);
        wp_set_post_terms($post->ID, [$term->term_id], 'category');

        $entries = (new TermSchema($settings))->sitemapEntries('category');

        $locs = array_column($entries, 'loc');
        $this->assertContains('https://example.com/category/active/', $locs);

        $entry = $entries[array_search('https://example.com/category/active/', $locs, true)];
        $this->assertNotNull($entry['lastmod']);
    }

    public function test_sitemap_entries_empty_when_taxonomy_invisible(): void
    {
        $settings = $this->seedSettings(['taxonomies' => ['category' => ['search_engine_visibility' => false]]]);
        $term     = $this->category('Active', 'active');
        $post     = $this->createPost();
        wp_set_post_terms($post->ID, [$term->term_id], 'category');

        $this->assertSame([], (new TermSchema($settings))->sitemapEntries('category'));
    }
}
