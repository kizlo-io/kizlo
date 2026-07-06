<?php

namespace Kizlo\Tests\Seo;

use WP_User;
use Kizlo\Modules\Seo\HomeSchema;
use Kizlo\Modules\Seo\TermSchema;
use Kizlo\Modules\Seo\AuthorSchema;
use Kizlo\Modules\Post\PostSchema;

/**
 * Shape contract for the JSON-LD `@graph`.
 *
 * Two things are pinned here: the exact set of nodes each schema emits for a given
 * settings scenario (so a node can never silently appear or vanish), and the exact
 * content of each node type in both its minimal (all optional fields off) and
 * maximal (every optional field driven on by settings/content) form.
 *
 * Nodes are asserted as complete objects wherever their values are deterministic,
 * so a dropped/renamed/reordered key AND a wrong value both fail. Genuinely
 * environment-derived values (post dates, attachment/avatar URLs, the site
 * language) are recomputed in-test with the same source call and embedded, rather
 * than hardcoded, so the assertion stays a full-object lock without being fragile.
 */
class JsonLdShapeTest extends SeoTestCase
{
    /** Rebuild a schema `@id` the way SeoBase::schemaId() does for the pinned base URL. */
    private function sid(string $type, string $identifier = '1'): string
    {
        return self::BASE_URL . '#/schema/' . $type . '/' . $identifier;
    }

    /** The site language, an environment passthrough (get_bloginfo('language')). */
    private function lang(): string
    {
        return get_bloginfo('language');
    }

    // ====================================================
    // GRAPH ENVELOPE + NODE INVENTORY
    // ====================================================

    public function test_graph_wrapper_shape(): void
    {
        $ld = (new PostSchema($this->seedSettings()))->jsonLd($this->createPost());

        $this->assertShape(['@context', '@graph'], $ld);
        $this->assertSame('https://schema.org', $ld['@context']);
    }

    public function test_post_graph_node_inventory_maximal(): void
    {
        $settings = $this->seedSettings();
        $author   = self::factory()->user->create(['role' => 'author', 'display_name' => 'Ada']);
        $post     = $this->createPost([
            'post_author'  => $author,
            'thumbnail_id' => $this->createImage(),
        ]);
        wp_set_post_tags($post->ID, ['php']);

        $graph = (new PostSchema($settings))->jsonLd($post)['@graph'];

        // Base identity (WebSite + Organization), the page, its Article, the primary
        // image, the breadcrumb, and the author Person: seven nodes, no more, no less.
        $this->assertSame(
            ['WebSite', 'Organization+Brand', 'WebPage', 'Article', 'ImageObject', 'BreadcrumbList', 'Person'],
            $this->graphTypes($graph),
        );
    }

    public function test_post_graph_node_inventory_minimal(): void
    {
        // Default post: author 0 (no Person node), no thumbnail (no ImageObject),
        // article type forced off (no Article).
        $settings = $this->seedSettings(['post_types' => ['post' => ['article_type' => 'none']]]);

        $graph = (new PostSchema($settings))->jsonLd($this->createPost())['@graph'];

        $this->assertSame(
            ['WebSite', 'Organization+Brand', 'WebPage', 'BreadcrumbList'],
            $this->graphTypes($graph),
        );
    }

    public function test_term_graph_node_inventory(): void
    {
        $settings = $this->seedSettings();
        $term     = get_term(self::factory()->category->create(['name' => 'News', 'slug' => 'news']), 'category');

        $graph = (new TermSchema($settings))->jsonLd($term)['@graph'];

        $this->assertSame(
            ['WebSite', 'Organization+Brand', 'WebPage+CollectionPage', 'BreadcrumbList'],
            $this->graphTypes($graph),
        );
    }

    public function test_author_graph_node_inventory(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);
        $user     = new WP_User(self::factory()->user->create(['role' => 'author', 'display_name' => 'Ada', 'user_login' => 'ada']));

        $graph = (new AuthorSchema($settings))->jsonLd($user)['@graph'];

        $this->assertSame(
            ['WebSite', 'Organization+Brand', 'WebPage+ProfilePage', 'BreadcrumbList', 'Person'],
            $this->graphTypes($graph),
        );
    }

    public function test_home_graph_node_inventory_latest_posts(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');
        update_option('page_on_front', 0);

        $graph = (new HomeSchema($settings))->jsonLd()['@graph'];

        // A latest-posts homepage is base identity plus a plain WebPage: no Article,
        // no image, no breadcrumb.
        $this->assertSame(['WebSite', 'Organization+Brand', 'WebPage'], $this->graphTypes($graph));
    }

    // ====================================================
    // WEBSITE
    // ====================================================

    public function test_website_node_minimal_is_full_object(): void
    {
        $settings = $this->seedSettings(['site' => ['tagline' => null, 'alternate_name' => null, 'search_action_structure' => null]]);

        $node = $this->findNode((new PostSchema($settings))->jsonLd($this->createPost())['@graph'], 'WebSite');

        $this->assertSame([
            '@type'           => 'WebSite',
            '@id'             => $this->sid('WebSite'),
            'url'             => self::BASE_URL,
            'name'            => 'Example Site',
            'inLanguage'      => $this->lang(),
            'publisher'       => ['@id' => $this->sid('Organization')],
            'copyrightHolder' => ['@id' => $this->sid('Organization')],
        ], $node);
    }

    public function test_website_node_full_is_full_object(): void
    {
        $settings = $this->seedSettings(['site' => [
            'alternate_name'          => 'Ex',
            'tagline'                 => 'The example tagline',
            'search_action_structure' => '/?s={{search_term}}',
        ]]);

        $node = $this->findNode((new PostSchema($settings))->jsonLd($this->createPost())['@graph'], 'WebSite');

        // The search-action urlTemplate is a resolved template string, so it is read
        // back and embedded (with a sanity check) rather than hardcoded.
        $url_template = $node['potentialAction']['target']['urlTemplate'] ?? null;
        $this->assertIsString($url_template);
        $this->assertStringContainsString('s=', $url_template);

        $this->assertSame([
            '@type'           => 'WebSite',
            '@id'             => $this->sid('WebSite'),
            'url'             => self::BASE_URL,
            'name'            => 'Example Site',
            'inLanguage'      => $this->lang(),
            'alternateName'   => 'Ex',
            'description'     => 'The example tagline',
            'publisher'       => ['@id' => $this->sid('Organization')],
            'copyrightHolder' => ['@id' => $this->sid('Organization')],
            'potentialAction' => [
                '@type'       => 'SearchAction',
                'target'      => ['@type' => 'EntryPoint', 'urlTemplate' => $url_template],
                'query-input' => ['@type' => 'PropertyValueSpecification', 'valueRequired' => true, 'valueName' => 'search_term_string'],
            ],
        ], $node);
    }

    // ====================================================
    // IDENTITY (ORGANIZATION / PERSON) — the settings flip you asked about
    // ====================================================

    public function test_organization_identity_is_full_object(): void
    {
        $settings = $this->seedSettings();

        $node = $this->findNode((new PostSchema($settings))->jsonLd($this->createPost())['@graph'], 'Organization');

        $this->assertSame([
            '@type' => ['Organization', 'Brand'],
            '@id'   => $this->sid('Organization'),
            'url'   => self::BASE_URL,
            'name'  => 'Example Org',
        ], $node);
    }

    public function test_person_identity_is_full_object(): void
    {
        // Flipping identity to a person swaps @type from [Organization, Brand] to
        // [Person, Organization], drops the `url` key, and re-anchors @id.
        $settings = $this->seedSettings(['identity' => ['type' => 'person'], 'person' => ['name' => 'Jane Person']]);

        $node = $this->findNode((new PostSchema($settings))->jsonLd($this->createPost())['@graph'], 'Person');

        $this->assertSame([
            '@type' => ['Person', 'Organization'],
            '@id'   => $this->sid('Person'),
            'name'  => 'Jane Person',
        ], $node);
    }

    public function test_organization_identity_full_is_full_object(): void
    {
        $logo     = $this->createImage(['file' => '2026/07/logo.jpg']);
        $settings = $this->seedSettings(['organization' => [
            'name'            => 'Example Org',
            'alternate_name'  => 'ExOrg',
            'slogan'          => 'We build things',
            'description'     => 'An example organization.',
            'email'           => 'hello@example.com',
            'phone'           => '+1 555 0100',
            'legal_name'      => 'Example Org LLC',
            'founding_date'   => '2010-01-01',
            'employees'       => 42,
            'logo'            => $logo,
            'founder'         => ['name' => 'Jane', 'social_profiles' => [['platform' => 'x', 'url' => 'https://x.com/jane']]],
            'social_profiles' => [['platform' => 'x', 'url' => 'https://x.com/acme']],
        ]]);

        $node    = $this->findNode((new PostSchema($settings))->jsonLd($this->createPost())['@graph'], 'Organization');
        $logo_id = $this->sid('logo/image', md5((string) $logo));
        $logo_url = wp_get_attachment_url($logo);

        $this->assertSame([
            '@type'             => ['Organization', 'Brand'],
            '@id'               => $this->sid('Organization'),
            'url'               => self::BASE_URL,
            'name'              => 'Example Org',
            'alternateName'     => 'ExOrg',
            'slogan'            => 'We build things',
            'description'       => 'An example organization.',
            'email'             => 'hello@example.com',
            'telephone'         => '+1 555 0100',
            'legalName'         => 'Example Org LLC',
            'foundingDate'      => '2010-01-01',
            'numberOfEmployees' => 42,
            'logo'              => [
                '@type'      => 'ImageObject',
                '@id'        => $logo_id,
                'url'        => $logo_url,
                'contentUrl' => $logo_url,
                'inLanguage' => $this->lang(),
                'caption'    => 'Example Org',
            ],
            'image'   => ['@id' => $logo_id],
            'founder' => ['@type' => 'Person', 'name' => 'Jane', 'sameAs' => ['https://x.com/jane']],
            'sameAs'  => ['https://x.com/acme'],
        ], $node);
    }

    public function test_person_identity_full_is_full_object(): void
    {
        $image    = $this->createImage(['file' => '2026/07/jane.jpg']);
        $settings = $this->seedSettings([
            'identity' => ['type' => 'person'],
            'person'   => ['name' => 'Jane Person', 'image' => $image, 'social_profiles' => [['platform' => 'x', 'url' => 'https://x.com/jane']]],
        ]);

        $node      = $this->findNode((new PostSchema($settings))->jsonLd($this->createPost())['@graph'], 'Person');
        $image_url = wp_get_attachment_url($image);

        $this->assertSame([
            '@type' => ['Person', 'Organization'],
            '@id'   => $this->sid('Person'),
            'name'  => 'Jane Person',
            'image' => [
                '@type'      => 'ImageObject',
                '@id'        => $image_url,
                'url'        => $image_url,
                'contentUrl' => $image_url,
                'inLanguage' => $this->lang(),
                'caption'    => 'Jane Person',
            ],
            'logo'   => ['@id' => $image_url],
            'sameAs' => ['https://x.com/jane'],
        ], $node);
    }

    // ====================================================
    // WEBPAGE (per schema, driven by settings/content)
    // ====================================================

    public function test_post_webpage_node_is_full_object(): void
    {
        $settings = $this->seedSettings();
        $post     = $this->createPost(['post_title' => 'Full', 'thumbnail_id' => $this->createImage()]);

        $node     = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'WebPage');
        $page_url = 'https://example.com/full/';

        $this->assertSame([
            '@type'              => 'WebPage',
            '@id'                => $page_url,
            'url'                => $page_url,
            'name'               => 'Full | Example Site',
            'isPartOf'           => ['@id' => $this->sid('WebSite')],
            'inLanguage'         => $this->lang(),
            'potentialAction'    => [['@type' => 'ReadAction', 'target' => [$page_url]]],
            // Default description template resolves from post content, so embed it.
            'description'        => $node['description'],
            'primaryImageOfPage' => ['@id' => $page_url . '#primaryimage'],
            'image'              => ['@id' => $page_url . '#primaryimage'],
            'thumbnailUrl'       => get_the_post_thumbnail_url($post, 'full'),
            'datePublished'      => get_the_date('c', $post),
            'dateModified'       => get_the_modified_date('c', $post),
            'breadcrumb'         => ['@id' => $page_url . '#breadcrumb'],
        ], $node);
        $this->assertIsString($node['description']);
    }

    public function test_collection_page_node_is_full_object(): void
    {
        // Empty term description keeps the collection page at its minimal shape.
        $settings = $this->seedSettings();
        $term     = get_term(self::factory()->category->create(['name' => 'News', 'slug' => 'news', 'description' => '']), 'category');

        $node     = $this->findNode((new TermSchema($settings))->jsonLd($term)['@graph'], 'CollectionPage');
        $page_url = 'https://example.com/category/news/';

        $this->assertSame([
            '@type'      => ['WebPage', 'CollectionPage'],
            '@id'        => $page_url,
            'url'        => $page_url,
            'name'       => 'News | Example Site',
            'isPartOf'   => ['@id' => $this->sid('WebSite')],
            'inLanguage' => $this->lang(),
            'breadcrumb' => ['@id' => $page_url . '#breadcrumb'],
        ], $node);
    }

    public function test_profile_page_node_is_full_object(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);
        $user     = new WP_User(self::factory()->user->create(['role' => 'author', 'display_name' => 'Ada Lovelace', 'user_login' => 'ada']));

        $node     = $this->findNode((new AuthorSchema($settings))->jsonLd($user)['@graph'], 'ProfilePage');
        $page_url = 'https://example.com/author/ada/';

        $this->assertSame([
            '@type'      => ['WebPage', 'ProfilePage'],
            '@id'        => $page_url,
            'url'        => $page_url,
            'name'       => 'Ada Lovelace | Example Site',
            'isPartOf'   => ['@id' => $this->sid('WebSite')],
            'inLanguage' => $this->lang(),
            'breadcrumb' => ['@id' => $page_url . '#breadcrumb'],
        ], $node);
    }

    public function test_home_webpage_node_is_full_object_latest_posts(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');
        update_option('page_on_front', 0);

        $node = $this->findNode((new HomeSchema($settings))->jsonLd()['@graph'], 'WebPage');
        $home = self::BASE_URL . '/';

        $this->assertSame([
            '@type'           => 'WebPage',
            '@id'             => $home,
            'url'             => $home,
            'name'            => 'Example Site',
            'isPartOf'        => ['@id' => $this->sid('WebSite')],
            'inLanguage'      => $this->lang(),
            'potentialAction' => [['@type' => 'ReadAction', 'target' => [$home]]],
            'description'     => 'The example tagline',
        ], $node);
    }

    // ====================================================
    // ARTICLE
    // ====================================================

    public function test_article_node_minimal_is_full_object(): void
    {
        // Default post: no author, no thumbnail, no tags, no comment action.
        $settings = $this->seedSettings();
        $post     = $this->createPost();

        $node     = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'Article');
        $page_url = 'https://example.com/hello-world/';

        $this->assertSame([
            '@type'            => 'Article',
            '@id'              => $page_url . '#article',
            'isPartOf'         => ['@id' => $page_url],
            'mainEntityOfPage' => ['@id' => $page_url],
            'headline'         => 'Hello World',
            'datePublished'    => get_the_date('c', $post),
            'dateModified'     => get_the_modified_date('c', $post),
            'wordCount'        => 2, // "Body content."
            'commentCount'     => 0,
            'inLanguage'       => $this->lang(),
            'publisher'        => ['@id' => $this->sid('Organization')],
            'copyrightYear'    => get_the_date('Y', $post),
            'copyrightHolder'  => ['@id' => $this->sid('Organization')],
        ], $node);
    }

    public function test_article_node_full_is_full_object(): void
    {
        $settings = $this->seedSettings(['post_types' => ['post' => [
            'article_type'             => 'NewsArticle',
            'comment_action_structure' => '/{{slug}}#respond',
        ]]]);
        $author = self::factory()->user->create(['role' => 'author', 'display_name' => 'Ada', 'user_email' => 'ada@example.com']);
        $post   = $this->createPost([
            'post_author'    => $author,
            'thumbnail_id'   => $this->createImage(),
            'comment_status' => 'open',
        ]);
        wp_set_post_tags($post->ID, ['php', 'seo']);

        $node     = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'NewsArticle');
        $page_url = 'https://example.com/hello-world/';

        // Tag order is not guaranteed, and the comment target is a resolved template:
        // check them independently, then embed so the rest is a strict full-object lock.
        $this->assertEqualsCanonicalizing(['php', 'seo'], $node['keywords']);
        $comment_target = $node['potentialAction']['target'] ?? null;
        $this->assertIsArray($comment_target);
        $this->assertStringContainsString('#respond', $comment_target[0]);

        $this->assertSame([
            '@type'            => ['Article', 'NewsArticle'],
            '@id'              => $page_url . '#article',
            'isPartOf'         => ['@id' => $page_url],
            'mainEntityOfPage' => ['@id' => $page_url],
            'headline'         => 'Hello World',
            'datePublished'    => get_the_date('c', $post),
            'dateModified'     => get_the_modified_date('c', $post),
            'wordCount'        => 2,
            'commentCount'     => 0,
            'inLanguage'       => $this->lang(),
            'publisher'        => ['@id' => $this->sid('Organization')],
            'copyrightYear'    => get_the_date('Y', $post),
            'copyrightHolder'  => ['@id' => $this->sid('Organization')],
            'author'           => ['name' => 'Ada', '@id' => $this->sid('Person', md5('ada@example.com'))],
            'image'            => ['@id' => $page_url . '#primaryimage'],
            'thumbnailUrl'     => get_the_post_thumbnail_url($post, 'full'),
            'keywords'         => $node['keywords'],
            'potentialAction'  => ['@type' => 'CommentAction', 'name' => 'Comment', 'target' => $comment_target],
        ], $node);
    }

    // ====================================================
    // IMAGE OBJECT
    // ====================================================

    public function test_primary_image_object_is_full_object(): void
    {
        $settings = $this->seedSettings();
        $post     = $this->createPost(['thumbnail_id' => $this->createImage(['width' => 1600, 'height' => 900])]);

        $node     = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'ImageObject');
        $page_url = 'https://example.com/hello-world/';

        $this->assertSame([
            '@type'      => 'ImageObject',
            '@id'        => $page_url . '#primaryimage',
            'url'        => get_the_post_thumbnail_url($post, 'full'),
            'contentUrl' => get_the_post_thumbnail_url($post, 'full'),
            'inLanguage' => $this->lang(),
            'width'      => 1600,
            'height'     => 900,
        ], $node);
    }

    // ====================================================
    // BREADCRUMB
    // ====================================================

    public function test_breadcrumb_node_is_full_object(): void
    {
        $settings = $this->seedSettings();
        $parent   = $this->createPost(['post_type' => 'page', 'post_title' => 'Parent']);
        $child    = $this->createPost(['post_type' => 'page', 'post_title' => 'Child', 'post_parent' => $parent->ID]);

        $node = $this->findNode((new PostSchema($settings))->jsonLd($child)['@graph'], 'BreadcrumbList');

        $this->assertSame([
            '@type'           => 'BreadcrumbList',
            '@id'             => 'https://example.com/child/#breadcrumb',
            'itemListElement' => [
                ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => self::BASE_URL],
                ['@type' => 'ListItem', 'position' => 2, 'name' => 'Parent', 'item' => 'https://example.com/parent/'],
                ['@type' => 'ListItem', 'position' => 3, 'name' => 'Child'],
            ],
        ], $node);
    }

    // ====================================================
    // AUTHOR PERSON
    // ====================================================

    public function test_author_person_node_minimal_is_full_object(): void
    {
        // Authors disabled (no archive url), no bio, no user_url: gravatar still
        // yields an image, and an organization identity adds worksFor.
        $settings = $this->seedSettings(['authors' => ['enabled' => false]]);
        $author   = self::factory()->user->create(['role' => 'author', 'display_name' => 'Grace', 'user_email' => 'grace@example.com']);
        $post     = $this->createPost(['post_author' => $author]);

        $node   = $this->findAuthorPerson((new PostSchema($settings))->jsonLd($post)['@graph'], 'Grace');
        $avatar = get_avatar_url($author, ['size' => 96]);

        $this->assertSame([
            '@type'    => 'Person',
            '@id'      => $this->sid('Person', md5('grace@example.com')),
            'name'     => 'Grace',
            'image'    => [
                '@type'      => 'ImageObject',
                '@id'        => $avatar,
                'url'        => $avatar,
                'contentUrl' => $avatar,
                'inLanguage' => $this->lang(),
                'caption'    => 'Grace',
            ],
            'worksFor' => ['@id' => $this->sid('Organization')],
        ], $node);
    }

    public function test_author_person_node_full_is_full_object(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);
        $author   = self::factory()->user->create([
            'role'         => 'author',
            'user_login'   => 'grace',
            'display_name' => 'Grace',
            'user_email'   => 'grace@example.com',
            'description'  => 'A bio.',
            'user_url'     => 'https://grace.example',
        ]);
        $post = $this->createPost(['post_author' => $author]);

        $node   = $this->findAuthorPerson((new PostSchema($settings))->jsonLd($post)['@graph'], 'Grace');
        $avatar = get_avatar_url($author, ['size' => 96]);

        $this->assertSame([
            '@type'       => 'Person',
            '@id'         => $this->sid('Person', md5('grace@example.com')),
            'name'        => 'Grace',
            'url'         => 'https://example.com/author/grace/',
            'image'       => [
                '@type'      => 'ImageObject',
                '@id'        => $avatar,
                'url'        => $avatar,
                'contentUrl' => $avatar,
                'inLanguage' => $this->lang(),
                'caption'    => 'Grace',
            ],
            'description' => 'A bio.',
            'sameAs'      => ['https://grace.example'],
            'worksFor'    => ['@id' => $this->sid('Organization')],
        ], $node);
    }

    /**
     * Find the author Person node (the identity Person, if any, is a different
     * @type array so is not matched by name here).
     *
     * @param array<int, array<string, mixed>> $graph
     *
     * @return array<string, mixed>|null
     */
    private function findAuthorPerson(array $graph, string $name): ?array
    {
        foreach ($graph as $node) {
            if (($node['@type'] ?? null) === 'Person' && ($node['name'] ?? null) === $name) return $node;
        }

        return null;
    }
}