<?php

namespace Kizlo\Modules\Post;

use WP_Post;
use Kizlo\Modules\Seo\SeoBase;
use Kizlo\Support\Variables;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;

class PostSchema extends SeoBase
{
    // ====================================================
    // SITEMAP
    // ====================================================

    /**
     * Build sitemap entries for a post type.
     *
     * @param string $post_type
     * @param int    $page
     *
     * @return array
     */
    public function sitemapEntries(string $post_type, int $page = 1): array
    {
        $post_type_settings = $this->settings->postTypes->get($post_type);

        if (empty($post_type_settings->getSearchEngineVisibility())) {
            return [];
        }

        $show_on_front = get_option('show_on_front');
        $posts_page_id = (int) get_option('page_for_posts');
        $front_page_id = (int) get_option('page_on_front');

        // In the page sitemap, drop the pages that are represented elsewhere: a
        // static homepage becomes the site root "/" (injected below), and a
        // static "Posts page" (e.g. /blog) is the blog index emitted in the post
        // sitemap. Removing them here avoids listing either page twice (and
        // keeps the homepage as "/" rather than its own pathname).
        $exclude = [];
        if ($post_type === 'page' && $show_on_front === 'page') {
            if ($front_page_id > 0) $exclude[] = $front_page_id;
            if ($posts_page_id > 0) $exclude[] = $posts_page_id;
        }

        $posts = get_posts([
            'post_type'      => $post_type,
            'post_status'    => 'publish',
            'posts_per_page' => self::SITEMAP_PER_PAGE,
            'offset'         => ($page - 1) * self::SITEMAP_PER_PAGE,
            'orderby'        => 'modified',
            'order'          => 'DESC',
            'fields'         => 'ids',
            'post__not_in'   => $exclude,
            // Exclude per-post noindex overrides at the query level so page
            // offsets and the index page count stay aligned on indexable posts.
            'meta_query'     => [[
                'key'     => self::OVERRIDE_KEYS['noindex'],
                'compare' => 'NOT EXISTS',
            ]],
        ]);

        $entries = [];

        // The first page carries an injected entry (the blog index in the post
        // sitemap, or the homepage in the page sitemap). Build it before the
        // empty-posts short-circuit so it survives on a brand-new site.
        if ($page === 1) {
            $front = $this->sitemapFrontEntry($post_type, $show_on_front, $posts_page_id, $front_page_id);
            if ($front !== null) $entries[] = $front;
        }

        if (empty($posts)) return $entries;

        foreach ($posts as $post_id) {
            $post = get_post($post_id);
            $url  = $this->resolvePostUrl($post, $post_type_settings);

            $entry = [
                'loc'     => trailingslashit($url),
                'lastmod' => get_post_modified_time('c', true, $post),
                'images'  => [],
            ];

            // Featured image
            $thumbnail_id = get_post_thumbnail_id($post_id);
            if ($thumbnail_id) {
                $thumbnail_url = wp_get_attachment_url($thumbnail_id);
                if ($thumbnail_url) {
                    $entry['images'][] = [
                        'loc'   => $thumbnail_url,
                        'title' => get_the_title($post),
                    ];
                }
            }

            // Content images
            if (!empty($post->post_content)) {
                preg_match_all('/<img[^>]+src=["\']([^"\']+)["\'][^>]*>/i', $post->post_content, $matches);
                foreach ($matches[1] as $image_url) {
                    $entry['images'][] = [
                        'loc'   => $image_url,
                        'title' => null,
                    ];
                }
            }

            $entries[] = $entry;
        }

        return $entries;
    }

    /**
     * Build the injected first-page sitemap entry, mirroring how Yoast splits
     * the homepage from the blog index:
     *
     * - Post sitemap: the blog index, which is the homepage when it lists the
     *   latest posts, otherwise the assigned "Posts page" URL (e.g. /blog).
     * - Page sitemap: the homepage, always represented as the site root "/" —
     *   the selected static page (excluded from the listing so it is not shown
     *   under its own pathname) or the posts index when the front page lists
     *   posts.
     *
     * lastmod tracks the static homepage's own modification, or the most recent
     * post when the homepage lists posts, falling back to now on an empty blog.
     *
     * @return array{loc: string, lastmod: string, images: array<int, mixed>}|null
     */
    protected function sitemapFrontEntry(string $post_type, string $show_on_front, int $posts_page_id, int $front_page_id): ?array
    {
        $home       = trailingslashit($this->settings->getBaseUrl());
        $blog_last  = $this->getPostTypeLastMod('post') ?? gmdate('c');

        if ($post_type === 'post') {
            if ($show_on_front === 'posts') {
                $loc = $home;
            } elseif ($posts_page_id > 0 && ($posts_page = get_post($posts_page_id))) {
                // A noindexed "Posts page" (e.g. /blog) is dropped from the sitemap.
                if ($this->isNoindexed($posts_page_id)) return null;
                $loc = trailingslashit($this->resolvePostUrl($posts_page, $this->settings->postTypes->get('page')));
            } else {
                // Static homepage with no Posts page: there is no blog index.
                return null;
            }

            return ['loc' => $loc, 'lastmod' => $blog_last, 'images' => []];
        }

        if ($post_type === 'page') {
            // The page sitemap only carries the homepage "/" when a static page is
            // assigned as the front page. On a latest-posts home the post sitemap
            // owns "/" and it must not appear here too (Yoast issue #5428).
            if ($show_on_front !== 'page' || $front_page_id <= 0) {
                return null;
            }

            // A noindexed static front page drops the homepage "/" from the sitemap,
            // matching the noindex robots tag HomeSchema emits for it.
            if ($this->isNoindexed($front_page_id)) {
                return null;
            }

            $home_last = get_post_modified_time('c', true, $front_page_id) ?: $blog_last;

            return ['loc' => $home, 'lastmod' => $home_last, 'images' => []];
        }

        return null;
    }

    // ====================================================
    // META
    // ====================================================

    /**
     * Build SEO meta data for a post.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    public function buildMeta(WP_Post $post): array
    {
        $post_type_settings = $this->settings->postTypes->get($post->post_type);
        $overrides          = $this->postSeoOverrides($post);

        $url = $this->resolvePostUrl($post, $post_type_settings);

        $title       =  $this->getPostTitle($post, $post_type_settings);
        $description =  $this->getPostDescription($post, $post_type_settings);

        $canonical = !empty($overrides['canonical']) ? trailingslashit($overrides['canonical']) : trailingslashit($url);
        $indexable = $post_type_settings->getSearchEngineVisibility() && empty($overrides['noindex']);
        $nofollow  = !empty($overrides['nofollow']);

        // Open Graph and Twitter each fall back to the SEO title/description and
        // the base image, with per-network overrides layered on top. The base
        // image is the featured image, falling back to the site fallback image.
        $social = $this->resolveSocial(
            $overrides,
            $title,
            $description,
            get_post_thumbnail_id($post->ID) ?: ($this->settings->site->getFallbackImage() ?: null),
            fn(string $template) => $this->resolvePostTemplate($template, $post),
        );

        $article_type    = $this->effectiveArticleType($post);
        $is_article_type = !empty($article_type) && $article_type !== 'none';

        return [
            'title'     => $title,
            'canonical' => $canonical,
            'robots'    => $this->buildRobots($indexable, $nofollow),
            'og'        => $this->buildOg([
                'type'        => 'article',
                'title'       => $social['og']['title'],
                'description' => $social['og']['description'],
                'url'         => trailingslashit($url),
                'image'       => $social['og']['image'],
            ]),
            'twitter'   => $this->buildTwitter([
                'title'       => $social['twitter']['title'],
                'description' => $social['twitter']['description'],
                'image'       => $social['twitter']['image']['url'] ?? null,
                'image_alt'   => $social['twitter']['image']['alt'] ?? null,
            ]),
            'article'   =>  $is_article_type ? $this->articleMetaFor($post) : null,
        ];
    }

    // ====================================================
    // JSON LD
    // ====================================================

    /**
     * Build post graph pieces into the graph array.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    public function jsonLd(WP_Post $post): array
    {
        $graph = $this->baseGraph();

        $graph[] = $this->postWebPageLd($post);

        $article = $this->articleLd($post);
        if (!empty($article)) $graph[] = $article;

        $image = $this->featuredImageLd($post);
        if (!empty($image)) $graph[] = $image;

        $graph[] = $this->breadcrumbLd($post);

        // When the author is the site's representative person, the identity node
        // from baseGraph() already represents them (same @id), so no separate
        // author node is emitted — the two merge into one.
        $author = get_userdata((int) $post->post_author);

        if ($author && !$this->isSitePerson($author)) {
            $graph[] = $this->personAuthorLd($author);
        }

        return $this->toGraph($graph);
    }

    /**
     * Generate WebPage JSON-LD piece for a post.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    public function postWebPageLd(WP_Post $post): array
    {
        $post_type_settings = $this->settings->postTypes->get($post->post_type);

        $url = $this->resolvePostUrl($post, $post_type_settings);

        return parent::webPageLd([
            'url'            => $url,
            'title'          => $this->getPostTitle($post, $post_type_settings),
            'description'    => $this->getPostDescription($post, $post_type_settings),
            'image_url'      => get_the_post_thumbnail_url($post, 'full') ?: null,
            'date_published' => get_the_date('c', $post),
            'date_modified'  => get_the_modified_date('c', $post),
            'breadcrumb_id'  => trailingslashit($url) . '#breadcrumb',
            'webpage_type'   => $this->effectiveWebpageType($post),
            'article_type'   => $this->effectiveArticleType($post) ?? null,
        ]);
    }

    private function getPostTitle(WP_Post $post, PostTypeSettings $post_type_settings): string
    {
        $override = $this->postSeoOverrides($post)['title'] ?? '';
        $template = $override !== '' ? $override : ($post_type_settings->getTitleStructure() ?? Variables::DEFAULT_POST_TITLE_TEMPLATE);

        return $this->resolvePostTemplate($template, $post);
    }

    private function getPostDescription(WP_Post $post, PostTypeSettings $post_type_settings): ?string
    {
        $override = $this->postSeoOverrides($post)['description'] ?? '';
        $template = $override !== '' ? $override : ($post_type_settings->getDescriptionStructure() ?? Variables::DEFAULT_POST_DESC_TEMPLATE);

        return $this->resolvePostTemplate($template, $post) ?: null;
    }

    /**
     * Resolve the default (pre-override) SEO values for a post. Used to seed the
     * meta box placeholders so editors see what each field falls back to.
     *
     * @param WP_Post $post
     *
     * @return array{title: string, description: string, canonical: string, indexable: bool, webpage_type: string, article_type: string, og_image: array{id: int, url: string|null}|null}
     */
    public function seoDefaults(WP_Post $post): array
    {
        $post_type_settings = $this->settings->postTypes->get($post->post_type);

        $title       = $this->resolvePostTemplate($post_type_settings->getTitleStructure() ?? Variables::DEFAULT_POST_TITLE_TEMPLATE, $post);
        $description = $this->resolvePostTemplate($post_type_settings->getDescriptionStructure() ?? Variables::DEFAULT_POST_DESC_TEMPLATE, $post) ?: '';

        $thumbnail_id = get_post_thumbnail_id($post->ID);

        return [
            'title'        => $title,
            'description'  => $description,
            'canonical'    => trailingslashit($this->resolvePostUrl($post, $post_type_settings)),
            'indexable'    => (bool) $post_type_settings->getSearchEngineVisibility(),
            'webpage_type' => $post_type_settings->getWebpageType(),
            'article_type' => $post_type_settings->getArticleType() ?: 'none',
            'og_image'     => $thumbnail_id ? ['id' => $thumbnail_id, 'url' => wp_get_attachment_url($thumbnail_id) ?: null] : null,
        ];
    }

    /**
     * Generate Article JSON-LD piece for a post.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    public function articleLd(WP_Post $post): array
    {
        $post_type_settings = $this->settings->postTypes->get($post->post_type);
        $article_type       = $this->effectiveArticleType($post);

        if (empty($article_type) || $article_type === 'none') {
            return [];
        }

        $page_url = trailingslashit($this->resolvePostUrl($post, $post_type_settings));

        return $this->buildArticleLd($post, $page_url, $article_type);
    }

    /**
     * Generate BreadcrumbList JSON-LD piece for a post.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    public function breadcrumbLd(WP_Post $post): array
    {
        $post_type_settings = $this->settings->postTypes->get($post->post_type);

        // Real ancestors: the post's hierarchical parents (pages), top-down.
        $ancestors = [];
        foreach (array_reverse(get_post_ancestors($post)) as $ancestor_id) {
            $ancestor = get_post($ancestor_id);
            if (!$ancestor) continue;

            $ancestors[] = [
                'name' => get_the_title($ancestor),
                'url'  => trailingslashit($this->resolvePostUrl($ancestor, $this->settings->postTypes->get($ancestor->post_type))),
            ];
        }

        return $this->buildBreadcrumbLd(
            $this->resolvePostUrl($post, $post_type_settings),
            get_the_title($post),
            $post_type_settings->getBreadcrumbs(),
            $ancestors,
        );
    }

    /**
     * Generate ImageObject JSON-LD piece for a post's featured image.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    public function featuredImageLd(WP_Post $post): array
    {
        $post_type_settings = $this->settings->postTypes->get($post->post_type);

        $thumbnail_id  = get_post_thumbnail_id($post->ID);
        $thumbnail_url = get_the_post_thumbnail_url($post, 'full');

        if (empty($thumbnail_url)) return [];

        $metadata = wp_get_attachment_metadata($thumbnail_id);

        return $this->primaryImageLd(
            $this->resolvePostUrl($post, $post_type_settings),
            $thumbnail_url,
            $metadata['width']  ?? null,
            $metadata['height'] ?? null,
            $this->imageCaption($thumbnail_id),
        );
    }
}
