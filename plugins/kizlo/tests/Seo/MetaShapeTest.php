<?php

namespace Kizlo\Tests\Seo;

use WP_User;
use Kizlo\Modules\Seo\SeoBase;
use Kizlo\Modules\Seo\HomeSchema;
use Kizlo\Modules\Seo\TermSchema;
use Kizlo\Modules\Seo\AuthorSchema;
use Kizlo\Modules\Post\PostSchema;

/**
 * Shape contract for the head metadata (`buildMeta`) and the primitives it is
 * assembled from (robots / Open Graph / Twitter / article blocks).
 *
 * Where the behavioural suite asserts individual values, this suite pins the full
 * key set of every payload so a dropped, renamed, or reordered field fails loudly.
 * The primitives are driven directly through reflection with controlled arguments
 * so both the "everything present" and "everything optional omitted" shapes are
 * exercised deterministically, then the four schemas confirm the top-level envelope.
 */
class MetaShapeTest extends SeoTestCase
{
    /** The fixed head envelope every schema's buildMeta() returns. */
    private const META_KEYS = ['title', 'canonical', 'robots', 'og', 'twitter', 'article'];

    /** Robots is always the full directive set, regardless of index/follow state. */
    private const ROBOTS_KEYS = ['index', 'follow', 'max-snippet', 'max-image-preview', 'max-video-preview'];

    /** The image detail sub-shape shared by OG and the image resolvers. */
    private const IMAGE_KEYS = ['url', 'width', 'height', 'type', 'alt'];

    // ====================================================
    // ROBOTS
    // ====================================================

    public function test_robots_full_object_flips_index_and_follow_only(): void
    {
        $seo = new SeoBase($this->seedSettings());

        // The crawl-budget directives are static; only index/follow track the flags.
        $this->assertSame([
            'index'             => 'index',
            'follow'            => 'follow',
            'max-snippet'       => 'max-snippet:-1',
            'max-image-preview' => 'max-image-preview:large',
            'max-video-preview' => 'max-video-preview:-1',
        ], $this->callProtected($seo, 'buildRobots', [true, false]));

        $this->assertSame([
            'index'             => 'noindex',
            'follow'            => 'nofollow',
            'max-snippet'       => 'max-snippet:-1',
            'max-image-preview' => 'max-image-preview:large',
            'max-video-preview' => 'max-video-preview:-1',
        ], $this->callProtected($seo, 'buildRobots', [false, true]));
    }

    /** The site-wide discourage toggle forces noindex even when the caller asks to index. */
    public function test_robots_discourage_overrides_indexable_flag(): void
    {
        $seo = new SeoBase($this->seedSettings(['site' => ['discourage_search_engines' => true]]));

        $this->assertSame('noindex', $this->callProtected($seo, 'buildRobots', [true, false])['index']);
    }

    // ====================================================
    // OPEN GRAPH
    // ====================================================

    public function test_open_graph_minimal_is_full_object(): void
    {
        $seo = new SeoBase($this->seedSettings());

        $og = $this->callProtected($seo, 'buildOg', [[
            'type'        => 'website',
            'title'       => 'Title',
            'description' => null,
            'url'         => self::BASE_URL,
            'image'       => null,
        ]]);

        $this->assertSame([
            'locale'    => get_locale(),
            'type'      => 'website',
            'title'     => 'Title',
            'url'       => self::BASE_URL,
            'site_name' => 'Example Site',
        ], $og);
    }

    public function test_open_graph_full_is_full_object(): void
    {
        $seo = new SeoBase($this->seedSettings());

        $image = ['url' => self::BASE_URL . '/i.jpg', 'width' => 1200, 'height' => 630, 'type' => 'image/jpeg', 'alt' => 'Alt'];

        $og = $this->callProtected($seo, 'buildOg', [[
            'type'        => 'article',
            'title'       => 'Title',
            'description' => 'A description.',
            'url'         => self::BASE_URL,
            'image'       => $image,
        ]]);

        $this->assertSame([
            'locale'      => get_locale(),
            'type'        => 'article',
            'title'       => 'Title',
            'url'         => self::BASE_URL,
            'site_name'   => 'Example Site',
            'description' => 'A description.',
            'image'       => $image,
        ], $og);
    }

    // ====================================================
    // TWITTER
    // ====================================================

    public function test_twitter_minimal_is_full_object(): void
    {
        // Default identity is an organization with no social profiles, so there is
        // no derivable handle: site/creator are present but null.
        $seo = new SeoBase($this->seedSettings());

        $twitter = $this->callProtected($seo, 'buildTwitter', [[
            'title'       => 'Title',
            'description' => null,
            'image'       => null,
            'image_alt'   => null,
        ]]);

        $this->assertSame([
            'card'    => 'summary',
            'title'   => 'Title',
            'site'    => null,
            'creator' => null,
        ], $twitter);
    }

    public function test_twitter_full_is_full_object(): void
    {
        $seo = new SeoBase($this->seedSettings([
            'organization' => [
                'name'            => 'Example Org',
                'social_profiles' => [['platform' => 'x', 'url' => 'https://x.com/acme']],
            ],
        ]));

        $twitter = $this->callProtected($seo, 'buildTwitter', [[
            'title'       => 'Title',
            'description' => 'A description.',
            'image'       => self::BASE_URL . '/i.jpg',
            'image_alt'   => 'Alt text',
        ]]);

        $this->assertSame([
            'card'      => 'summary_large_image',
            'title'     => 'Title',
            'site'      => '@acme',
            'creator'   => '@acme',
            'description' => 'A description.',
            'image'     => self::BASE_URL . '/i.jpg',
            'image_alt' => 'Alt text',
        ], $twitter);
    }

    // ====================================================
    // ARTICLE BLOCK
    // ====================================================

    public function test_article_block_is_empty_when_nothing_populated(): void
    {
        $seo = new SeoBase($this->seedSettings());

        $article = $this->callProtected($seo, 'buildArticleMeta', [[
            'published_time' => null,
            'modified_time'  => null,
            'author'         => null,
            'author_url'     => null,
            'section'        => null,
            'tags'           => [],
        ]]);

        $this->assertSame([], $article);
    }

    public function test_article_block_full_is_full_object(): void
    {
        $seo = new SeoBase($this->seedSettings());

        $article = $this->callProtected($seo, 'buildArticleMeta', [[
            'published_time' => '2026-01-01T00:00:00+00:00',
            'modified_time'  => '2026-01-02T00:00:00+00:00',
            'author'         => 'Ada',
            'author_url'     => self::BASE_URL . '/author/ada/',
            'section'        => 'Science',
            'tags'           => ['alpha', 'beta'],
        ]]);

        $this->assertSame([
            'published_time' => '2026-01-01T00:00:00+00:00',
            'modified_time'  => '2026-01-02T00:00:00+00:00',
            'author'         => 'Ada',
            'author_url'     => self::BASE_URL . '/author/ada/',
            'section'        => 'Science',
            'tags'           => ['alpha', 'beta'],
        ], $article);
    }

    // ====================================================
    // TOP-LEVEL ENVELOPE PER SCHEMA
    // ====================================================

    public function test_post_meta_envelope_shape_with_article(): void
    {
        $settings = $this->seedSettings();
        $author   = self::factory()->user->create(['role' => 'author', 'display_name' => 'Ada']);
        $post     = $this->createPost([
            'post_title'   => 'Shaped',
            'post_author'  => $author,
            'thumbnail_id' => $this->createImage(['alt' => 'Cover']),
        ]);
        // A post carries the default category, and tags + author complete the block.
        wp_set_post_tags($post->ID, ['alpha', 'beta']);

        $meta = (new PostSchema($settings))->buildMeta($post);

        $this->assertShape(self::META_KEYS, $meta);
        $this->assertShape(self::ROBOTS_KEYS, $meta['robots']);
        // Post default desc template is non-empty and the featured image resolves,
        // so OG carries both optional keys; the image detail sub-shape is fixed.
        $this->assertShape(['locale', 'type', 'title', 'url', 'site_name', 'description', 'image'], $meta['og']);
        $this->assertShape(self::IMAGE_KEYS, $meta['og']['image']);
        // Post type defaults to Article, so the article block is a fully populated array.
        $this->assertIsArray($meta['article']);
        $this->assertShape(['published_time', 'modified_time', 'author', 'author_url', 'section', 'tags'], $meta['article']);
    }

    public function test_post_meta_envelope_article_is_null_when_type_none(): void
    {
        $settings = $this->seedSettings(['post_types' => ['post' => ['article_type' => 'none']]]);

        $meta = (new PostSchema($settings))->buildMeta($this->createPost());

        $this->assertShape(self::META_KEYS, $meta);
        $this->assertNull($meta['article']);
    }

    public function test_home_meta_envelope_shape(): void
    {
        $settings = $this->seedSettings();
        update_option('show_on_front', 'posts');
        update_option('page_on_front', 0);

        $meta = (new HomeSchema($settings))->buildMeta();

        $this->assertShape(self::META_KEYS, $meta);
        $this->assertShape(self::ROBOTS_KEYS, $meta['robots']);
        $this->assertSame('website', $meta['og']['type']);
        $this->assertNull($meta['article']);
    }

    public function test_term_meta_envelope_shape_minimal_og(): void
    {
        $settings = $this->seedSettings();
        // An empty description makes the default `{{description}}` template resolve to
        // nothing, so terms carry neither description nor image: the settings/content
        // driven "optional OG keys absent" case.
        $term = get_term(self::factory()->category->create(['name' => 'News', 'slug' => 'news', 'description' => '']), 'category');

        $meta = (new TermSchema($settings))->buildMeta($term);

        $this->assertShape(self::META_KEYS, $meta);
        // With no description and no image, the term's OG/Twitter are fully
        // deterministic, so lock them as complete objects.
        $this->assertSame([
            'locale'    => get_locale(),
            'type'      => 'website',
            'title'     => 'News | Example Site',
            'url'       => 'https://example.com/category/news/',
            'site_name' => 'Example Site',
        ], $meta['og']);
        $this->assertSame([
            'card'    => 'summary',
            'title'   => 'News | Example Site',
            'site'    => null,
            'creator' => null,
        ], $meta['twitter']);
        $this->assertNull($meta['article']);
    }

    public function test_author_meta_envelope_shape(): void
    {
        $settings = $this->seedSettings(['authors' => ['enabled' => true]]);
        $user     = new WP_User(self::factory()->user->create(['role' => 'author', 'display_name' => 'Ada', 'user_login' => 'ada']));

        $meta = (new AuthorSchema($settings))->buildMeta($user);

        $this->assertShape(self::META_KEYS, $meta);
        $this->assertShape(self::ROBOTS_KEYS, $meta['robots']);
        $this->assertSame('profile', $meta['og']['type']);
        $this->assertNull($meta['article']);
    }
}
