<?php

namespace Kizlo\Tests\Seo;

use Kizlo\Modules\Post\PostSchema;

/**
 * The JSON-LD `@graph` for a post: the base identity pieces, the WebPage node and
 * its type/action rules, the Article node, the primary image, the breadcrumb
 * chain, and the author Person node, plus how per-post type overrides flow through.
 */
class PostSchemaJsonLdTest extends SeoTestCase
{
    public function test_graph_carries_context_and_base_identity_pieces(): void
    {
        $settings = $this->seedSettings();
        $ld       = (new PostSchema($settings))->jsonLd($this->createPost());

        $this->assertSame('https://schema.org', $ld['@context']);

        $website = $this->findNode($ld['@graph'], 'WebSite');
        $this->assertNotNull($website);
        $this->assertSame('https://example.com', $website['url']);
        $this->assertSame('Example Site', $website['name']);

        // Organization identity (default) rather than Person.
        $this->assertNotNull($this->findNode($ld['@graph'], 'Organization'));
        $this->assertNull($this->findNode($ld['@graph'], 'Person'));
    }

    public function test_person_identity_replaces_organization_when_configured(): void
    {
        $settings = $this->seedSettings(['identity' => ['type' => 'person'], 'person' => ['name' => 'Jane Person']]);
        $ld       = (new PostSchema($settings))->jsonLd($this->createPost());

        // The site identity Person node (@type ['Person','Organization']) is present;
        // the author Person node is separate and keyed by email hash.
        $identity = null;
        foreach ($ld['@graph'] as $node) {
            if (($node['@type'] ?? null) === ['Person', 'Organization']) $identity = $node;
        }

        $this->assertNotNull($identity);
        $this->assertSame('Jane Person', $identity['name']);
    }

    public function test_webpage_node_anchors_to_trailing_slashed_url(): void
    {
        $settings = $this->seedSettings();
        $post     = $this->createPost(['post_title' => 'Graph Post']);

        $webpage = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'WebPage');

        $this->assertSame('https://example.com/graph-post/', $webpage['@id']);
        $this->assertSame('https://example.com/graph-post/', $webpage['url']);
        // A plain WebPage carries a ReadAction and points at its breadcrumb.
        $this->assertSame('ReadAction', $webpage['potentialAction'][0]['@type']);
        $this->assertSame('https://example.com/graph-post/#breadcrumb', $webpage['breadcrumb']['@id']);
    }

    public function test_webpage_type_override_widens_the_type_array(): void
    {
        $settings = $this->seedSettings();
        $page     = $this->createPost(['post_type' => 'page', 'post_title' => 'About'], ['webpage_type' => 'AboutPage']);

        $webpage = $this->findNode((new PostSchema($settings))->jsonLd($page)['@graph'], 'AboutPage');

        $this->assertSame(['WebPage', 'AboutPage'], $webpage['@type']);
    }

    public function test_collection_page_type_omits_read_action(): void
    {
        $settings = $this->seedSettings();
        $page     = $this->createPost(['post_type' => 'page'], ['webpage_type' => 'CollectionPage']);

        $webpage = $this->findNode((new PostSchema($settings))->jsonLd($page)['@graph'], 'CollectionPage');

        $this->assertArrayNotHasKey('potentialAction', $webpage);
    }

    public function test_article_node_present_with_author_and_keywords(): void
    {
        $settings = $this->seedSettings();
        $author   = self::factory()->user->create(['role' => 'author', 'user_email' => 'ada@example.com', 'display_name' => 'Ada']);
        $post     = $this->createPost(['post_author' => $author, 'post_title' => 'Article Post']);
        wp_set_post_tags($post->ID, ['php', 'seo']);

        $article = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'Article');

        $this->assertSame('https://example.com/article-post/#article', $article['@id']);
        $this->assertSame('Ada', $article['author']['name']);
        // Author @id is derived from the email hash so it is stable + shared.
        $this->assertSame('https://example.com#/schema/Person/' . md5('ada@example.com'), $article['author']['@id']);
        $this->assertEqualsCanonicalizing(['php', 'seo'], $article['keywords']);
    }

    public function test_article_type_override_widens_article_type_array(): void
    {
        $settings = $this->seedSettings();
        $post     = $this->createPost([], ['article_type' => 'NewsArticle']);

        $article = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'NewsArticle');

        $this->assertSame(['Article', 'NewsArticle'], $article['@type']);
    }

    public function test_no_article_node_when_type_is_none(): void
    {
        $settings = $this->seedSettings();
        $page     = $this->createPost(['post_type' => 'page']);

        $this->assertNull($this->findNode((new PostSchema($settings))->jsonLd($page)['@graph'], 'Article'));
    }

    public function test_primary_image_object_emitted_for_featured_image(): void
    {
        $thumb    = $this->createImage(['width' => 1600, 'height' => 900]);
        $settings = $this->seedSettings();
        $post     = $this->createPost(['post_title' => 'Imaged', 'thumbnail_id' => $thumb]);

        $graph = (new PostSchema($settings))->jsonLd($post)['@graph'];
        $image = $this->findNode($graph, 'ImageObject');

        $this->assertSame('https://example.com/imaged/#primaryimage', $image['@id']);
        $this->assertSame(1600, $image['width']);

        // The WebPage node references it back by @id.
        $webpage = $this->findNode($graph, 'WebPage');
        $this->assertSame('https://example.com/imaged/#primaryimage', $webpage['primaryImageOfPage']['@id']);
    }

    public function test_breadcrumb_lists_home_ancestors_and_self(): void
    {
        $settings = $this->seedSettings();
        $parent   = $this->createPost(['post_type' => 'page', 'post_title' => 'Parent']);
        $child    = $this->createPost(['post_type' => 'page', 'post_title' => 'Child', 'post_parent' => $parent->ID]);

        $crumb = $this->findNode((new PostSchema($settings))->jsonLd($child)['@graph'], 'BreadcrumbList');
        $items = $crumb['itemListElement'];

        $this->assertSame('Home', $items[0]['name']);
        $this->assertSame('https://example.com', $items[0]['item']);
        $this->assertSame('Parent', $items[1]['name']);
        $this->assertSame('Child', $items[2]['name']);
        // Positions increment and the final crumb has no link.
        $this->assertSame([1, 2, 3], array_column($items, 'position'));
        $this->assertArrayNotHasKey('item', $items[2]);
    }

    public function test_author_person_node_is_included(): void
    {
        $settings = $this->seedSettings();
        $author   = self::factory()->user->create(['role' => 'author', 'display_name' => 'Grace']);
        $post     = $this->createPost(['post_author' => $author]);

        $graph = (new PostSchema($settings))->jsonLd($post)['@graph'];

        $person = null;
        foreach ($graph as $node) {
            if (($node['@type'] ?? null) === 'Person' && ($node['name'] ?? null) === 'Grace') $person = $node;
        }

        $this->assertNotNull($person);
    }
}
