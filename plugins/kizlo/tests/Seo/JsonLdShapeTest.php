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
            ['WebSite', 'Organization', 'WebPage', 'Article', 'ImageObject', 'BreadcrumbList', 'Person'],
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
            ['WebSite', 'Organization', 'WebPage', 'BreadcrumbList'],
            $this->graphTypes($graph),
        );
    }

    public function test_term_graph_node_inventory(): void
    {
        $settings = $this->seedSettings();
        $term     = get_term(self::factory()->category->create(['name' => 'News', 'slug' => 'news']), 'category');

        $graph = (new TermSchema($settings))->jsonLd($term)['@graph'];

        $this->assertSame(
            ['WebSite', 'Organization', 'WebPage+CollectionPage', 'BreadcrumbList'],
            $this->graphTypes($graph),
        );
    }

    public function test_author_graph_node_inventory(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);
        $user     = new WP_User(self::factory()->user->create(['role' => 'author', 'display_name' => 'Ada', 'user_login' => 'ada']));

        $graph = (new AuthorSchema($settings))->jsonLd($user)['@graph'];

        $this->assertSame(
            ['WebSite', 'Organization', 'WebPage+ProfilePage', 'BreadcrumbList', 'Person'],
            $this->graphTypes($graph),
        );
    }

    public function test_home_graph_node_inventory_latest_posts(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');
        update_option('page_on_front', 0);

        $graph = (new HomeSchema($settings))->jsonLd()['@graph'];

        // A latest-posts homepage is base identity plus a plain WebPage and the
        // single-item breadcrumb: no Article, no image.
        $this->assertSame(['WebSite', 'Organization', 'WebPage', 'BreadcrumbList'], $this->graphTypes($graph));
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
            '@id'             => $this->webSiteId(),
            'url'             => self::BASE_URL,
            'name'            => 'Example Site',
            'inLanguage'      => $this->lang(),
            'publisher'       => ['@id' => $this->orgId()],
            'copyrightHolder' => ['@id' => $this->orgId()],
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
            '@id'             => $this->webSiteId(),
            'url'             => self::BASE_URL,
            'name'            => 'Example Site',
            'inLanguage'      => $this->lang(),
            'alternateName'   => 'Ex',
            'description'     => 'The example tagline',
            'publisher'       => ['@id' => $this->orgId()],
            'copyrightHolder' => ['@id' => $this->orgId()],
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
            '@type' => 'Organization',
            '@id'   => $this->orgId(),
            'url'   => self::BASE_URL,
            'name'  => 'Example Org',
        ], $node);
    }

    public function test_person_identity_is_full_object(): void
    {
        // Person identity is a WordPress user: @type is [Person, Organization],
        // the name comes from the account, and @id is keyed by the user so it can
        // merge with that user's author node. With no settings image the profile
        // photo falls back to the user's avatar.
        $user     = self::factory()->user->create(['display_name' => 'Jane Person', 'user_login' => 'jane']);
        $settings = $this->seedSettings(['identity' => ['type' => 'person'], 'person' => ['user_id' => $user]]);

        $node   = $this->findNode((new PostSchema($settings))->jsonLd($this->createPost())['@graph'], 'Person');
        $avatar = get_avatar_url($user, ['size' => 96]);

        $this->assertSame([
            '@type' => ['Person', 'Organization'],
            '@id'   => $this->personId($user),
            'name'  => 'Jane Person',
            'image' => [
                '@type'      => 'ImageObject',
                '@id'        => $avatar,
                'url'        => $avatar,
                'contentUrl' => $avatar,
                'inLanguage' => $this->lang(),
                'caption'    => 'Jane Person',
            ],
            'logo'  => ['@id' => $avatar],
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
            'employees_min'   => 11,
            'employees_max'   => 50,
            'logo'            => $logo,
            'founder'         => ['name' => 'Jane', 'social_profiles' => [['platform' => 'x', 'url' => 'https://x.com/jane']]],
            'social_profiles' => [['platform' => 'x', 'url' => 'https://x.com/acme']],
            'vat_id'          => 'GB123456789',
            'tax_id'          => '12-3456789',
            'iso6523_code'    => '0060:123456789',
            'duns'            => '150483782',
            'lei_code'        => '529900T8BM49AURSDO55',
            'naics'           => '511210',
            'publishing_principles'      => 'https://example.com/publishing-principles/',
            'ownership_funding_info'     => 'https://example.com/ownership-funding/',
            'actionable_feedback_policy' => 'https://example.com/feedback-policy/',
            'corrections_policy'         => 'https://example.com/corrections-policy/',
            'ethics_policy'              => 'https://example.com/ethics-policy/',
            'diversity_policy'           => 'https://example.com/diversity-policy/',
            'diversity_staffing_report'  => 'https://example.com/diversity-report/',
        ]]);

        $node    = $this->findNode((new PostSchema($settings))->jsonLd($this->createPost())['@graph'], 'Organization');
        $logo_id = $this->logoImageId();
        $logo_url = wp_get_attachment_url($logo);

        $this->assertSame([
            '@type'             => 'Organization',
            '@id'               => $this->orgId(),
            'url'               => self::BASE_URL,
            'name'              => 'Example Org',
            'alternateName'     => 'ExOrg',
            'slogan'            => 'We build things',
            'description'       => 'An example organization.',
            'email'             => 'hello@example.com',
            'telephone'         => '+1 555 0100',
            'legalName'         => 'Example Org LLC',
            'foundingDate'      => '2010-01-01',
            'vatID'             => 'GB123456789',
            'taxID'             => '12-3456789',
            'iso6523Code'       => '0060:123456789',
            'duns'              => '150483782',
            'leiCode'           => '529900T8BM49AURSDO55',
            'naics'             => '511210',
            'numberOfEmployees' => ['@type' => 'QuantitativeValue', 'minValue' => 11, 'maxValue' => 50],
            'publishingPrinciples'     => 'https://example.com/publishing-principles/',
            'ownershipFundingInfo'     => 'https://example.com/ownership-funding/',
            'actionableFeedbackPolicy' => 'https://example.com/feedback-policy/',
            'correctionsPolicy'        => 'https://example.com/corrections-policy/',
            'ethicsPolicy'             => 'https://example.com/ethics-policy/',
            'diversityPolicy'          => 'https://example.com/diversity-policy/',
            'diversityStaffingReport'  => 'https://example.com/diversity-report/',
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

    public function test_organization_number_of_employees_partial_range(): void
    {
        // Only a lower bound: QuantitativeValue carries minValue and omits maxValue.
        $min  = $this->seedSettings(['organization' => ['employees_min' => 11]]);
        $node = $this->findNode((new PostSchema($min))->jsonLd($this->createPost())['@graph'], 'Organization');
        $this->assertSame(['@type' => 'QuantitativeValue', 'minValue' => 11], $node['numberOfEmployees']);

        // Only an upper bound: maxValue only.
        $max  = $this->seedSettings(['organization' => ['employees_max' => 50]]);
        $node = $this->findNode((new PostSchema($max))->jsonLd($this->createPost())['@graph'], 'Organization');
        $this->assertSame(['@type' => 'QuantitativeValue', 'maxValue' => 50], $node['numberOfEmployees']);

        // Neither bound set: the property is omitted entirely.
        $none = $this->seedSettings();
        $node = $this->findNode((new PostSchema($none))->jsonLd($this->createPost())['@graph'], 'Organization');
        $this->assertArrayNotHasKey('numberOfEmployees', $node);
    }

    public function test_person_identity_full_is_full_object(): void
    {
        $image    = $this->createImage(['file' => '2026/07/jane.jpg']);
        $user     = self::factory()->user->create([
            'display_name' => 'Jane Person',
            'user_login'   => 'jane',
            'description'  => 'A bio.',
        ]);
        $settings = $this->seedSettings([
            'identity' => ['type' => 'person'],
            'person'   => ['user_id' => $user, 'image' => $image, 'social_profiles' => [['platform' => 'x', 'url' => 'https://x.com/jane']]],
        ]);

        $node      = $this->findNode((new PostSchema($settings))->jsonLd($this->createPost())['@graph'], 'Person');
        $image_url = wp_get_attachment_url($image);

        $this->assertSame([
            '@type' => ['Person', 'Organization'],
            '@id'   => $this->personId($user),
            'name'  => 'Jane Person',
            'image' => [
                '@type'      => 'ImageObject',
                '@id'        => $image_url,
                'url'        => $image_url,
                'contentUrl' => $image_url,
                'inLanguage' => $this->lang(),
                'caption'    => 'Jane Person',
            ],
            'logo'        => ['@id' => $image_url],
            'description' => 'A bio.',
            'sameAs'      => ['https://x.com/jane'],
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
            'isPartOf'           => ['@id' => $this->webSiteId()],
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
            'isPartOf'   => ['@id' => $this->webSiteId()],
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
            'isPartOf'   => ['@id' => $this->webSiteId()],
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
            'isPartOf'        => ['@id' => $this->webSiteId()],
            'inLanguage'      => $this->lang(),
            'about'           => ['@id' => $this->orgId()],
            'potentialAction' => [['@type' => 'ReadAction', 'target' => [$home]]],
            'description'     => 'The example tagline',
            'breadcrumb'      => ['@id' => $home . '#breadcrumb'],
        ], $node);
    }

    // ====================================================
    // ARTICLE
    // ====================================================

    public function test_article_node_minimal_is_full_object(): void
    {
        // Default post: no author, no thumbnail, no tags, comments closed, only the
        // excluded default category. A freshly published post is not modified, so
        // there is no dateModified, commentCount, or articleSection.
        $settings = $this->seedSettings();
        $post     = $this->createPost(['comment_status' => 'closed']);

        $node     = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'Article');
        $page_url = 'https://example.com/hello-world/';

        $this->assertSame([
            '@type'            => 'Article',
            '@id'              => $page_url . '#article',
            'isPartOf'         => ['@id' => $page_url],
            'mainEntityOfPage' => ['@id' => $page_url],
            'headline'         => 'Hello World',
            'datePublished'    => get_the_date('c', $post),
            'wordCount'        => 2, // "Body content."
            'inLanguage'       => $this->lang(),
            'publisher'        => ['@id' => $this->orgId()],
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
        wp_set_post_categories($post->ID, [self::factory()->category->create(['name' => 'News'])]);

        // Backdate publication so the (now) modified time is strictly later,
        // exercising the dateModified gate.
        wp_update_post(['ID' => $post->ID, 'post_date' => '2020-01-01 08:00:00', 'post_date_gmt' => '2020-01-01 08:00:00']);
        $post = get_post($post->ID);

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
            'publisher'        => ['@id' => $this->orgId()],
            'author'           => ['name' => 'Ada', '@id' => $this->personId($author)],
            'image'            => ['@id' => $page_url . '#primaryimage'],
            'thumbnailUrl'     => get_the_post_thumbnail_url($post, 'full'),
            'keywords'         => $node['keywords'],
            'articleSection'   => ['News'],
            'potentialAction'  => ['@type' => 'CommentAction', 'name' => 'Comment', 'target' => $comment_target],
        ], $node);
    }

    public function test_article_section_excludes_default_category(): void
    {
        // A post filed only under the auto-assigned default ("Uncategorized") has no
        // real section, so articleSection is omitted entirely.
        $settings = $this->seedSettings();
        $post     = $this->createPost();
        wp_set_post_categories($post->ID, [(int) get_option('default_category')]);

        $node = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'Article');

        $this->assertArrayNotHasKey('articleSection', $node);
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

    public function test_primary_image_caption_comes_from_alt_text(): void
    {
        // With no WordPress caption set, the ImageObject caption falls back to the
        // attachment's alt text (matching Yoast's image helper).
        $settings = $this->seedSettings();
        $post     = $this->createPost(['thumbnail_id' => $this->createImage(['alt' => 'A red bicycle'])]);

        $node = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'ImageObject');

        $this->assertSame('A red bicycle', $node['caption']);
    }

    public function test_primary_image_caption_prefers_wordpress_caption_over_alt(): void
    {
        $settings = $this->seedSettings();
        $post     = $this->createPost(['thumbnail_id' => $this->createImage(['caption' => 'The caption', 'alt' => 'The alt'])]);

        $node = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'ImageObject');

        $this->assertSame('The caption', $node['caption']);
    }

    // ====================================================
    // BREADCRUMB
    // ====================================================

    public function test_breadcrumb_node_is_full_object(): void
    {
        // The 'page' type carries a single Parent row, so the child page's real
        // ancestor chain (Parent) expands between Home and the current page.
        $settings = $this->seedSettings(['post_types' => ['page' => ['breadcrumbs' => ['__parent__']]]]);
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

    public function test_breadcrumb_default_is_home_and_current(): void
    {
        // No configured rows: the always-safe Home → current.
        $settings = $this->seedSettings();
        $post     = $this->createPost(['post_title' => 'Solo']);

        $node = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'BreadcrumbList');

        $this->assertSame([
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => self::BASE_URL],
            ['@type' => 'ListItem', 'position' => 2, 'name' => 'Solo'],
        ], $node['itemListElement']);
    }

    public function test_breadcrumb_middle_rows_keep_configured_order(): void
    {
        // A picked page followed by the Parent token: Home → Blog → [real
        // ancestors] → current, in exactly the configured order.
        $blog     = $this->createPost(['post_type' => 'page', 'post_title' => 'Blog']);
        $settings = $this->seedSettings(['post_types' => ['page' => ['breadcrumbs' => [$blog->ID, '__parent__']]]]);

        $parent = $this->createPost(['post_type' => 'page', 'post_title' => 'Parent']);
        $child  = $this->createPost(['post_type' => 'page', 'post_title' => 'Child', 'post_parent' => $parent->ID]);

        $node  = $this->findNode((new PostSchema($settings))->jsonLd($child)['@graph'], 'BreadcrumbList');
        $names = array_column($node['itemListElement'], 'name');

        $this->assertSame(['Home', 'Blog', 'Parent', 'Child'], $names);
    }

    public function test_home_breadcrumb_is_single_home_item(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');
        update_option('page_on_front', 0);

        $node = $this->findNode((new HomeSchema($settings))->jsonLd()['@graph'], 'BreadcrumbList');

        $this->assertSame([
            '@type'           => 'BreadcrumbList',
            '@id'             => self::BASE_URL . '/#breadcrumb',
            'itemListElement' => [
                ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home'],
            ],
        ], $node);
    }

    public function test_breadcrumb_skips_unpublished_page_row(): void
    {
        // A draft page configured as a crumb is dropped; only the published one shows.
        $draft    = $this->createPost(['post_type' => 'page', 'post_title' => 'Draft', 'post_status' => 'draft']);
        $live     = $this->createPost(['post_type' => 'page', 'post_title' => 'Live']);
        $settings = $this->seedSettings(['post_types' => ['post' => ['breadcrumbs' => [$draft->ID, $live->ID]]]]);
        $post     = $this->createPost(['post_title' => 'Solo']);

        $node  = $this->findNode((new PostSchema($settings))->jsonLd($post)['@graph'], 'BreadcrumbList');
        $names = array_column($node['itemListElement'], 'name');

        $this->assertSame(['Home', 'Live', 'Solo'], $names);
    }

    public function test_breadcrumb_skips_invalid_page_rows(): void
    {
        // A zero and a non-existent ID resolve to nothing; the Parent token still
        // expands the real ancestor chain.
        $settings = $this->seedSettings(['post_types' => ['page' => ['breadcrumbs' => ['0', 999999, '__parent__']]]]);
        $parent   = $this->createPost(['post_type' => 'page', 'post_title' => 'Parent']);
        $child    = $this->createPost(['post_type' => 'page', 'post_title' => 'Child', 'post_parent' => $parent->ID]);

        $node  = $this->findNode((new PostSchema($settings))->jsonLd($child)['@graph'], 'BreadcrumbList');
        $names = array_column($node['itemListElement'], 'name');

        $this->assertSame(['Home', 'Parent', 'Child'], $names);
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
            '@id'      => $this->personId($author),
            'name'     => 'Grace',
            'image'    => [
                '@type'      => 'ImageObject',
                '@id'        => $avatar,
                'url'        => $avatar,
                'contentUrl' => $avatar,
                'inLanguage' => $this->lang(),
                'caption'    => 'Grace',
            ],
            'worksFor' => ['@id' => $this->orgId()],
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
            '@id'         => $this->personId($author),
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
            'worksFor'    => ['@id' => $this->orgId()],
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