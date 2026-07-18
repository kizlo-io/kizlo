<?php

namespace Kizlo\Modules\Seo;

use WP_User;
use WP_Post;
use WP_Term;
use Kizlo\Modules\Settings\Settings;
use Kizlo\Support\Variables;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;

class SeoBase
{
    protected const SITEMAP_PER_PAGE = 1000;

    /**
     * Pathname of the generated sitemap index. Fixed because the frontend sitemap route is
     * mounted at a hardcoded base (`/sitemaps`) and the index `<loc>`s point at it, so the
     * path cannot vary. robots.txt advertises exactly this, matching what the frontend serves.
     */
    protected const SITEMAP_INDEX_PATH = '/sitemaps/index.xml';

    /**
     * Reserved breadcrumb row that expands, in place, to the current item's real
     * ancestor chain (page parents / parent terms). A page-ID row cannot collide
     * with it since IDs are numeric. Mirrored as a literal in the settings
     * sanitizers (HasBreadcrumbsSetting) and on the frontend.
     */
    public const BREADCRUMB_PARENT_TOKEN = '__parent__';

    /**
     * Per-post SEO override fields mapped to their individual post meta keys.
     * Each override lives in its own key (rather than a serialized blob) so it
     * stays queryable — e.g. sitemaps exclude posts by `_kizlo_seo_noindex`.
     * All keys are underscore-prefixed, keeping them internal (hidden from the
     * custom fields UI and the REST API).
     *
     * @var array<string, string>
     */
    public const OVERRIDE_KEYS = [
        'title'               => '_kizlo_seo_title',
        'description'         => '_kizlo_seo_description',
        'canonical'           => '_kizlo_seo_canonical',
        'webpage_type'        => '_kizlo_seo_webpage_type',
        'article_type'        => '_kizlo_seo_article_type',
        'noindex'             => '_kizlo_seo_noindex',
        'nofollow'            => '_kizlo_seo_nofollow',
        'og_title'            => '_kizlo_seo_og_title',
        'og_description'      => '_kizlo_seo_og_description',
        'og_image_id'         => '_kizlo_seo_og_image',
        'twitter_title'       => '_kizlo_seo_twitter_title',
        'twitter_description' => '_kizlo_seo_twitter_description',
        'twitter_image_id'    => '_kizlo_seo_twitter_image',
    ];

    public function __construct(protected Settings $settings) {}

    // ====================================================
    // ROBOTS
    // ====================================================

    public function robots(): array
    {
        if ($this->settings->site->getDiscourageSearchEngines()) {
            return ['rules' => [[
                'user_agent' => '*',
                'allow'      => [],
                'disallow'   => ['/'],
            ]]];
        }

        $rules = [
            'user_agent' => '*',
            'allow'      => ['/'],
            'disallow'   => [],
        ];

        $customRules = $this->settings->crawling->robots->getCustomRules();
        if (!empty($customRules)) {
            $result = ['rules' => $this->groupCustomRules($customRules)];
        } else {
            $result = ['rules' => [$rules]];
        }

        if ($this->settings->crawling->robots->getIncludeSitemap()) {
            $result['sitemaps'] = [untrailingslashit($this->resolveUrl($this->settings->getBaseUrl(), self::SITEMAP_INDEX_PATH))];
        }

        return $result;
    }

    /**
     * Group flat custom rules by user agent into the emitted robots.txt shape.
     *
     * @param array<int, array{user_agent: string, rule: string, path: string}> $customRules
     *
     * @return array<int, array{user_agent: string, allow: string[], disallow: string[]}>
     */
    private function groupCustomRules(array $customRules): array
    {
        $grouped = [];

        foreach ($customRules as $rule) {
            $agent = $rule['user_agent'];
            $grouped[$agent] ??= ['user_agent' => $agent, 'allow' => [], 'disallow' => []];

            $bucket = $rule['rule'] === 'allow' ? 'allow' : 'disallow';
            $grouped[$agent][$bucket][] = $rule['path'];
        }

        return array_values($grouped);
    }

    // ====================================================
    // SITEMAP
    // ====================================================

    /**
     * Build the sitemap index entries.
     *
     * @return array
     */
    public function sitemapIndex(): array
    {
        $entries = [];

        $show_on_front = get_option('show_on_front');
        $posts_page_id = (int) get_option('page_for_posts');
        $front_page_id = (int) get_option('page_on_front');

        $noindex_counts = $this->noindexedCountsByType();

        foreach ($this->settings->postTypes->all() as $post_type_slug => $post_type) {
            if (! $post_type->getSearchEngineVisibility()) continue;

            $published = (int) (wp_count_posts($post_type_slug)->publish ?? 0);
            $count     = max(0, $published - ($noindex_counts[$post_type_slug] ?? 0));

            $carries_front = match ($post_type_slug) {
                'post'  => $show_on_front === 'posts' || ($posts_page_id > 0 && ! $this->isNoindexed($posts_page_id)),
                'page'  => $show_on_front === 'page' && $front_page_id > 0 && ! $this->isNoindexed($front_page_id),
                default => false,
            };

            if ($count === 0 && ! $carries_front) continue;

            $pages   = max(1, (int) ceil($count / self::SITEMAP_PER_PAGE));
            $lastmod = $this->getPostTypeLastMod($post_type_slug) ?? gmdate('c');

            $entries[] = [
                'key'     => $post_type_slug,
                'type'    => 'post_type',
                'pages'   => $pages,
                'lastmod' => $lastmod,
            ];
        }

        foreach ($this->settings->taxonomies->all() as $taxonomy_slug => $taxonomy) {
            if (! $taxonomy->getSearchEngineVisibility()) continue;

            $count = wp_count_terms([
                'taxonomy'   => $taxonomy_slug,
                'hide_empty' => true,
                'meta_query' => [[
                    'key'     => self::OVERRIDE_KEYS['noindex'],
                    'compare' => 'NOT EXISTS',
                ]],
            ]);
            if (empty($count) || is_wp_error($count)) continue;

            $pages   = (int) ceil($count / self::SITEMAP_PER_PAGE);
            $lastmod = $this->getTaxonomyLastMod($taxonomy_slug);

            $entries[] = [
                'key'     => $taxonomy_slug,
                'type'    => 'taxonomy',
                'pages'   => $pages,
                'lastmod' => $lastmod,
            ];
        }

        if ($this->settings->authors->getEnabled() && $this->settings->authors->getSearchEngineVisibility()) {
            $count = count(get_users(['has_published_posts' => true, 'fields' => 'ID']));

            if ($count > 0) {
                $pages   = (int) ceil($count / self::SITEMAP_PER_PAGE);
                $lastmod = $this->getAuthorsLastMod();

                $entries[] = [
                    'key'     => 'authors',
                    'type'    => 'author',
                    'pages'   => $pages,
                    'lastmod' => $lastmod,
                ];
            }
        }

        return $entries;
    }

    /**
     * Canonical public origin (scheme + host) derived from the configured Kizlo site URL.
     * Used to build absolute sitemap `<loc>`s so callers never fall back to the request host.
     *
     * @return string
     */
    public function siteOrigin(): string
    {
        return $this->getOrigin($this->settings->getBaseUrl());
    }

    /**
     * Count published posts carrying a per-post noindex override, grouped by post
     * type, in a single query. Used to derive the indexable count for the index.
     *
     * @return array<string, int>
     */
    protected function noindexedCountsByType(): array
    {
        global $wpdb;

        $rows = $wpdb->get_results(
            "SELECT p.post_type AS post_type, COUNT(*) AS total
             FROM {$wpdb->postmeta} pm
             INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
             WHERE pm.meta_key = '_kizlo_seo_noindex' AND pm.meta_value = '1' AND p.post_status = 'publish'
             GROUP BY p.post_type",
            ARRAY_A
        );

        $counts = [];
        foreach (is_array($rows) ? $rows : [] as $row) {
            $counts[(string) $row['post_type']] = (int) $row['total'];
        }

        return $counts;
    }

    /**
     * Whether a post carries a per-post noindex override.
     *
     * @param int $post_id
     *
     * @return bool
     */
    protected function isNoindexed(int $post_id): bool
    {
        return get_post_meta($post_id, self::OVERRIDE_KEYS['noindex'], true) === '1';
    }

    /**
     * Get the last modified date of the most recent post in a post type.
     *
     * @param string $post_type
     *
     * @return string|null
     */
    protected function getPostTypeLastMod(string $post_type): ?string
    {
        $posts = get_posts([
            'post_type'      => $post_type,
            'posts_per_page' => 1,
            'orderby'        => 'modified',
            'order'          => 'DESC',
            'fields'         => 'ids',
        ]);

        if (empty($posts)) return null;

        return get_post_modified_time('c', true, $posts[0]);
    }

    /**
     * Get the last modified date of the most recently modified term in a taxonomy.
     *
     * @param string $taxonomy
     *
     * @return string|null
     */
    private function getTaxonomyLastMod(string $taxonomy): ?string
    {
        $terms = get_terms([
            'taxonomy'   => $taxonomy,
            'hide_empty' => true,
            'number'     => 1,
            'orderby'    => 'count',
            'order'      => 'DESC',
            'fields'     => 'ids',
        ]);

        if (empty($terms) || is_wp_error($terms)) return null;

        $posts = get_posts([
            'post_type'      => 'any',
            'posts_per_page' => 1,
            'orderby'        => 'modified',
            'order'          => 'DESC',
            'tax_query'      => [
                [
                    'taxonomy' => $taxonomy,
                    'operator' => 'EXISTS',
                ],
            ],
            'fields'         => 'ids',
        ]);

        if (empty($posts)) return null;

        return get_post_modified_time('c', true, $posts[0]);
    }

    /**
     * Get the last modified date of the most recently active author.
     *
     * @return string|null
     */
    private function getAuthorsLastMod(): ?string
    {
        $posts = get_posts([
            'post_type'      => 'any',
            'posts_per_page' => 1,
            'orderby'        => 'modified',
            'order'          => 'DESC',
            'fields'         => 'ids',
        ]);

        if (empty($posts)) return null;

        return get_post_modified_time('c', true, $posts[0]);
    }

    // ====================================================
    // META
    // ====================================================

    /**
     * Build robots meta tag values.
     *
     * @param bool $indexable Whether the page should be indexed.
     * @param bool $nofollow  Whether links on the page should not be followed.
     *
     * @return array
     */
    protected function buildRobots(bool $indexable, bool $nofollow = false): array
    {
        $indexable = $indexable && !$this->settings->site->getDiscourageSearchEngines();

        return [
            'index'             => $indexable ? 'index' : 'noindex',
            'follow'            => $nofollow ? 'nofollow' : 'follow',
            'max-snippet'       => 'max-snippet:-1',
            'max-image-preview' => 'max-image-preview:large',
            'max-video-preview' => 'max-video-preview:-1',
        ];
    }

    /**
     * Build Open Graph meta tag values.
     *
     * @param array{
     *     type: string,
     *     title: string,
     *     description: string|null,
     *     url: string,
     *     image: array{url: string, width: int|null, height: int|null, type: string|null, alt: string|null}|null,
     * } $og
     *
     * @return array
     */
    protected function buildOg(array $og): array
    {
        $data = [
            'locale'      => get_locale(),
            'type'        => $og['type'],
            'title'       => $og['title'],
            'url'         => $og['url'],
            'site_name'   => $this->settings->site->getName() ?? get_bloginfo('name'),
        ];

        if (!empty($og['description'])) {
            $data['description'] = $og['description'];
        }

        if (!empty($og['image'])) {
            $data['image'] = $og['image'];
        }

        return $data;
    }

    /**
     * Build Twitter meta tag values.
     *
     * @param array{
     *     title: string,
     *     description: string|null,
     *     image: string|null,
     *     image_alt: string|null,
     * } $twitter
     *
     * @return array
     */
    protected function buildTwitter(array $twitter): array
    {
        $social_profiles = $this->settings->identity->isOrganization()
            ? $this->settings->identity->organization->getSocialProfiles()
            : $this->settings->identity->person->getSocialProfiles();

        $twitter_handle = null;
        foreach ($social_profiles as $profile) {
            if ($profile['platform'] === 'twitter' || $profile['platform'] === 'x') {
                $twitter_handle = '@' . basename(rtrim($profile['url'], '/'));
                break;
            }
        }

        $data = [
            'card'    => !empty($twitter['image']) ? 'summary_large_image' : 'summary',
            'title'   => $twitter['title'],
            'site'    => $twitter_handle,
            'creator' => $twitter_handle,
        ];

        if (!empty($twitter['description'])) {
            $data['description'] = $twitter['description'];
        }

        if (!empty($twitter['image'])) {
            $data['image'] = $twitter['image'];
        }

        if (!empty($twitter['image_alt'])) {
            $data['image_alt'] = $twitter['image_alt'];
        }

        return $data;
    }

    /**
     * Resolve an attachment id into the image detail shape used by OG/Twitter.
     *
     * @param int|null $id
     *
     * @return array{url: string, width: int|null, height: int|null, type: string|null, alt: string|null}|null
     */
    protected function imageDetails(?int $id): ?array
    {
        if (empty($id)) return null;

        $url = wp_get_attachment_url($id);
        if (empty($url)) return null;

        $metadata = wp_get_attachment_metadata($id);

        return [
            'url'    => $url,
            'width'  => $metadata['width']  ?? null,
            'height' => $metadata['height'] ?? null,
            'type'   => get_post_mime_type($id) ?: null,
            'alt'    => get_post_meta($id, '_wp_attachment_image_alt', true) ?: null,
        ];
    }

    /**
     * Resolve the effective Open Graph and Twitter values from the per-post
     * overrides, layered over the base SEO title/description/image. Twitter
     * falls back to Open Graph, which falls back to the base values.
     *
     * @param array                    $overrides      The `_kizlo_seo` override array.
     * @param string                   $base_title     Resolved SEO title.
     * @param string|null              $base_desc      Resolved SEO description.
     * @param int|null                 $base_image_id  Fallback image (featured image or site fallback).
     * @param callable(string): string $resolve        Resolves a title/description template string.
     *
     * @return array{
     *     og: array{title: string, description: string|null, image: array|null},
     *     twitter: array{title: string, description: string|null, image: array|null},
     * }
     */
    protected function resolveSocial(array $overrides, string $base_title, ?string $base_desc, ?int $base_image_id, callable $resolve): array
    {
        $og_title    = !empty($overrides['og_title'])       ? $resolve($overrides['og_title'])       : $base_title;
        $og_desc     = !empty($overrides['og_description']) ? $resolve($overrides['og_description']) : $base_desc;
        $og_image_id = !empty($overrides['og_image_id'])    ? (int) $overrides['og_image_id']        : $base_image_id;

        $tw_title    = !empty($overrides['twitter_title'])       ? $resolve($overrides['twitter_title'])       : $og_title;
        $tw_desc     = !empty($overrides['twitter_description']) ? $resolve($overrides['twitter_description']) : $og_desc;
        $tw_image_id = !empty($overrides['twitter_image_id'])    ? (int) $overrides['twitter_image_id']        : $og_image_id;

        return [
            'og' => [
                'title'       => $og_title,
                'description' => $og_desc,
                'image'       => $this->imageDetails($og_image_id),
            ],
            'twitter' => [
                'title'       => $tw_title,
                'description' => $tw_desc,
                'image'       => $this->imageDetails($tw_image_id),
            ],
        ];
    }

    /**
     * Build article meta tag values.
     *
     * @param array{
     *     published_time: string|null,
     *     modified_time: string|null,
     *     author: string|null,
     *     author_url: string|null,
     *     section: string|null,
     *     tags: string[],
     * } $article
     *
     * @return array
     */
    protected function buildArticleMeta(array $article): array
    {
        $data = [];

        if (!empty($article['published_time'])) {
            $data['published_time'] = $article['published_time'];
        }

        if (!empty($article['modified_time'])) {
            $data['modified_time'] = $article['modified_time'];
        }

        if (!empty($article['author'])) {
            $data['author'] = $article['author'];
        }

        if (!empty($article['author_url'])) {
            $data['author_url'] = $article['author_url'];
        }

        if (!empty($article['section'])) {
            $data['section'] = $article['section'];
        }

        if (!empty($article['tags'])) {
            $data['tags'] = $article['tags'];
        }

        return $data;
    }

    /**
     * Resolve the article meta block for a post. Shared by regular posts (their
     * own head) and a static front page opted into an Article type (the homepage
     * head). Callers gate this on the post having a real Article type.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    protected function articleMetaFor(WP_Post $post): array
    {
        $author = get_userdata((int) $post->post_author);
        $tags   = get_the_tags($post->ID);

        return $this->buildArticleMeta([
            'published_time' => get_the_date('c', $post),
            'modified_time'  => get_the_modified_date('c', $post),
            'author'         => $author ? $author->display_name : null,
            'author_url'     => $author ? $this->resolveAuthorUrl($author) : null,
            'section'        => get_the_category($post->ID)[0]->name ?? null,
            'tags'           => $tags && !is_wp_error($tags) ? array_map(fn($tag) => $tag->name, $tags) : [],
        ]);
    }

    // ====================================================
    // SCHEMA TYPE OVERRIDES
    // ====================================================

    /**
     * Read the per-post SEO overrides stored by the editor meta box.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    protected function postSeoOverrides(WP_Post $post): array
    {
        $overrides = [];

        foreach (self::OVERRIDE_KEYS as $field => $meta_key) {
            $value = get_post_meta($post->ID, $meta_key, true);

            if ($value !== '' && $value !== false && $value !== null) {
                $overrides[$field] = $value;
            }
        }

        return $overrides;
    }

    /**
     * Read the per-term SEO overrides stored by the term editor.
     *
     * Terms reuse the same override keys as posts (stored in term meta, a
     * separate table, so there is no collision). The term editor only writes the
     * content/robots/social subset; `webpage_type`/`article_type` never apply.
     *
     * @param WP_Term $term
     *
     * @return array
     */
    protected function termSeoOverrides(WP_Term $term): array
    {
        $overrides = [];

        foreach (self::OVERRIDE_KEYS as $field => $meta_key) {
            $value = get_term_meta($term->term_id, $meta_key, true);

            if ($value !== '' && $value !== false && $value !== null) {
                $overrides[$field] = $value;
            }
        }

        return $overrides;
    }

    /**
     * The effective Schema.org WebPage subtype for a post: the per-post override
     * if set, otherwise the post type's configured type.
     */
    protected function effectiveWebpageType(WP_Post $post): string
    {
        $override = $this->postSeoOverrides($post)['webpage_type'] ?? '';

        return $override !== '' ? $override : $this->settings->postTypes->get($post->post_type)->getWebpageType();
    }

    /**
     * The effective Schema.org Article subtype for a post: the per-post override
     * if set, otherwise the post type's configured type.
     */
    protected function effectiveArticleType(WP_Post $post): ?string
    {
        $override = $this->postSeoOverrides($post)['article_type'] ?? '';

        return $override !== '' ? $override : $this->settings->postTypes->get($post->post_type)->getArticleType();
    }

    // ====================================================
    // JSON LD
    // ====================================================

    /**
     * Build an Article JSON-LD piece for a post, anchored to an arbitrary page
     * URL. Shared by regular posts (their own permalink) and a static front page
     * (the site base URL). Callers guarantee $article_type is a real type (not
     * empty or 'none').
     *
     * @param WP_Post $post
     * @param string  $page_url      The trailing-slashed URL the article belongs to.
     * @param string  $article_type  Resolved Schema.org Article subtype.
     *
     * @return array
     */
    protected function buildArticleLd(WP_Post $post, string $page_url, string $article_type): array
    {
        $post_type_settings = $this->settings->postTypes->get($post->post_type);

        $data = [
            '@type'            => $article_type !== 'Article' ? ['Article', $article_type] : 'Article',
            '@id'              => $page_url . '#article',
            'isPartOf'         => ['@id' => $page_url],
            'mainEntityOfPage' => ['@id' => $page_url],
            'headline'         => get_the_title($post),
            'datePublished'    => get_the_date('c', $post),
        ];

        $published = get_the_date('c', $post);
        $modified  = get_the_modified_date('c', $post);
        if (strtotime($modified) > strtotime($published)) {
            $data['dateModified'] = $modified;
        }

        $data['wordCount'] = str_word_count(wp_strip_all_tags($post->post_content));

        if (comments_open($post->ID)) {
            $data['commentCount'] = (int) get_comments_number($post->ID);
        }

        $data['inLanguage'] = $this->language();

        $publisher_id = $this->publisherId();
        if ($publisher_id !== '') {
            $data['publisher'] = ['@id' => $publisher_id];
        }

        $author = get_userdata((int) $post->post_author);
        if ($author) {
            $data['author'] = [
                'name' => $author->display_name,
                '@id'  => $this->personId($author),
            ];
        }

        $thumbnail_url = get_the_post_thumbnail_url($post, 'full');
        if ($thumbnail_url) {
            $data['image']        = ['@id' => $page_url . '#primaryimage'];
            $data['thumbnailUrl'] = $thumbnail_url;
        }

        $tags = get_the_tags($post->ID);
        if ($tags && !is_wp_error($tags)) {
            $data['keywords'] = array_map(fn($tag) => $tag->name, $tags);
        }

        $default_category = (int) get_option('default_category');
        $categories       = get_the_category($post->ID);
        if (!empty($categories)) {
            $sections = [];
            foreach ($categories as $category) {
                if ((int) $category->term_id === $default_category) continue;
                $sections[] = $category->name;
            }

            if (!empty($sections)) $data['articleSection'] = $sections;
        }

        if (comments_open($post->ID) && !empty($post_type_settings->getCommentActionStructure())) {
            $structure   = $post_type_settings->getCommentActionStructure();
            $pathname    = trim(str_replace($this->settings->getBaseUrl(), '', $page_url), '/');
            $resolved    = $this->resolvePostTemplate($structure, $post, ['pathname' => $pathname]);
            $comment_url = untrailingslashit($this->resolveUrl($this->settings->getBaseUrl(), $resolved));

            $data['potentialAction'] = [
                '@type'  => 'CommentAction',
                'name'   => 'Comment',
                'target' => [$comment_url],
            ];
        }

        return $data;
    }

    /**
     * Wrap graph pieces into a JSON-LD graph object.
     *
     * @param array $graph
     *
     * @return array
     */
    protected function toGraph(array $graph): array
    {
        return [
            '@context' => 'https://schema.org',
            '@graph'   => array_values(array_filter($graph)),
        ];
    }

    /**
     * Build the base graph pieces present on every page.
     * 
     * @return array
     */
    protected function baseGraph(): array
    {
        return [
            $this->webSiteLd(),
            $this->settings->identity->isOrganization()
                ? $this->organizationIdentityLd()
                : $this->personIdentityLd(),
        ];
    }

    /**
     * Generate WebSite JSON-LD piece.
     *
     * @return array
     */
    protected function webSiteLd(): array
    {
        $data = [
            '@type'      => 'WebSite',
            '@id'        => $this->webSiteId(),
            'url'        => $this->settings->getBaseUrl(),
            'name'       => $this->settings->site->getName() ?? get_bloginfo('name'),
            'inLanguage' => $this->language(),
        ];

        if (!empty($this->settings->site->getAlternateName())) {
            $data['alternateName'] = $this->settings->site->getAlternateName();
        }

        if (!empty($this->settings->site->getTagline())) {
            $data['description'] = $this->settings->site->getTagline();
        }

        $publisher_id = $this->publisherId();
        if ($publisher_id !== '') {
            $data['publisher']       = ['@id' => $publisher_id];
            $data['copyrightHolder'] = ['@id' => $publisher_id];
        }

        if (! empty($this->settings->site->getSearchActionStructure())) {
            $data['potentialAction'] = [
                '@type'       => 'SearchAction',
                'target'      => [
                    '@type'       => 'EntryPoint',
                    'urlTemplate' => $this->resolveUrl($this->settings->getBaseUrl(), Variables::resolve(
                        $this->settings->site->getSearchActionStructure(),
                        [],
                        $this->settings->site
                    )),
                ],
                'query-input' => [
                    '@type'         => 'PropertyValueSpecification',
                    'valueRequired' => true,
                    'valueName'     => 'search_term_string',
                ],
            ];
        }

        return $data;
    }

    /**
     * Generate WebPage JSON-LD piece.
     *
     * @param array{
     *     url: string,
     *     title: string,
     *     description: string|null,
     *     image_url: string|null,
     *     date_published: string|null,
     *     date_modified: string|null,
     *     breadcrumb_id: string|null,
     *     webpage_type: string|null,
     *     article_type: string|null,
     *     about?: string|null,
     * } $page
     *
     * @return array
     */
    protected function webPageLd(array $page): array
    {
        $page_url     = trailingslashit($page['url']);
        $image_id     = !empty($page['image_url']) ? $page_url . '#primaryimage' : null;
        $webpage_type = $page['webpage_type'] ?? 'WebPage';

        $data = [
            '@type'      => $webpage_type !== 'WebPage' ? ['WebPage', $webpage_type] : 'WebPage',
            '@id'        => $page_url,
            'url'        => $page_url,
            'name'       => $page['title'],
            'isPartOf'   => ['@id' => $this->webSiteId()],
            'inLanguage' => $this->language(),
        ];

        if (!empty($page['about'])) {
            $data['about'] = ['@id' => $page['about']];
        }

        if (!in_array($webpage_type, ['CollectionPage', 'SearchResultsPage', 'ProfilePage'])) {
            $data['potentialAction'] = [
                ['@type' => 'ReadAction', 'target' => [$page_url]]
            ];
        }

        if (!empty($page['description'])) {
            $data['description'] = $page['description'];
        }

        if ($image_id) {
            $data['primaryImageOfPage'] = ['@id' => $image_id];
            $data['image']              = ['@id' => $image_id];
            $data['thumbnailUrl']       = $page['image_url'];
        }

        if (!empty($page['date_published'])) {
            $data['datePublished'] = $page['date_published'];
        }

        if (!empty($page['date_modified'])) {
            $data['dateModified'] = $page['date_modified'];
        }

        if (!empty($page['breadcrumb_id'])) {
            $data['breadcrumb'] = ['@id' => $page['breadcrumb_id']];
        }

        return $data;
    }

    /**
     * Generate an ImageObject JSON-LD piece.
     *
     * The single source of truth for every ImageObject node (page primary
     * images, logos, avatars). Callers own the `@id` since it varies by usage:
     * primary images anchor to `<url>#primaryimage`, logos to a schema id, and
     * profile/avatar images to the image URL itself.
     *
     * @param string $id  The node `@id`.
     * @param string $url The image source URL.
     * @param array{width?: int|null, height?: int|null, caption?: string|null} $extra
     *
     * @return array
     */
    protected function imageObjectLd(string $id, string $url, array $extra = []): array
    {
        $data = [
            '@type'      => 'ImageObject',
            '@id'        => $id,
            'url'        => $url,
            'contentUrl' => $url,
            'inLanguage' => $this->language(),
        ];

        if (!empty($extra['width']))   $data['width']   = $extra['width'];
        if (!empty($extra['height']))  $data['height']  = $extra['height'];
        if (!empty($extra['caption'])) $data['caption'] = $extra['caption'];

        return $data;
    }

    /**
     * Generate the primary ImageObject JSON-LD piece for a page.
     *
     * The WebPage piece references this node by `@id` (`<url>#primaryimage`),
     * so it must be emitted into the graph whenever a page carries an image.
     *
     * @param string      $url       The page URL the image belongs to.
     * @param string      $image_url The image source URL.
     * @param int|null    $width
     * @param int|null    $height
     * @param string|null $caption
     *
     * @return array
     */
    protected function primaryImageLd(string $url, string $image_url, ?int $width = null, ?int $height = null, ?string $caption = null): array
    {
        return $this->imageObjectLd(trailingslashit($url) . '#primaryimage', $image_url, [
            'width'   => $width,
            'height'  => $height,
            'caption' => $caption,
        ]);
    }

    /**
     * Build a BreadcrumbList from configured middle rows.
     *
     * Trail: Home → [rows] → current. A page-ID row resolves to that page's
     * crumb; the {@see BREADCRUMB_PARENT_TOKEN} row expands, in place, to the
     * current item's real ancestor chain (passed in pre-resolved, top-down). The
     * current item is the final crumb and carries no link. An empty row list
     * yields the always-safe Home → current.
     *
     * @param string $current_url  Trailing-slashed URL of the current item.
     * @param string $current_name Display name of the current item.
     * @param list<int|string> $rows Configured middle rows (page IDs / parent token).
     * @param list<array{name: string, url: string}> $ancestors Real ancestors, top-down.
     *
     * @return array
     */
    protected function buildBreadcrumbLd(string $current_url, string $current_name, array $rows, array $ancestors): array
    {
        $current_url = trailingslashit($current_url);
        $position    = 1;

        $items = [[
            '@type'    => 'ListItem',
            'position' => $position++,
            'name'     => __('Home', 'kizlo'),
            'item'     => $this->settings->getBaseUrl(),
        ]];

        foreach ($rows as $row) {
            if ($row === self::BREADCRUMB_PARENT_TOKEN) {
                foreach ($ancestors as $ancestor) {
                    $items[] = [
                        '@type'    => 'ListItem',
                        'position' => $position++,
                        'name'     => $ancestor['name'],
                        'item'     => $ancestor['url'],
                    ];
                }
                continue;
            }

            $crumb = $this->pageCrumb((int) $row);
            if ($crumb === null) continue;

            $items[] = [
                '@type'    => 'ListItem',
                'position' => $position++,
                'name'     => $crumb['name'],
                'item'     => $crumb['url'],
            ];
        }

        $items[] = [
            '@type'    => 'ListItem',
            'position' => $position,
            'name'     => $current_name,
        ];

        return [
            '@type'           => 'BreadcrumbList',
            '@id'             => $current_url . '#breadcrumb',
            'itemListElement' => $items,
        ];
    }

    /**
     * Resolve a page-ID breadcrumb row to its name + URL, or null when the page
     * is missing or unpublished.
     *
     * @param int $page_id
     *
     * @return array{name: string, url: string}|null
     */
    protected function pageCrumb(int $page_id): ?array
    {
        $page = get_post($page_id);
        if (!$page || $page->post_status !== 'publish') return null;

        return [
            'name' => get_the_title($page),
            'url'  => trailingslashit($this->resolvePostUrl($page, $this->settings->postTypes->get($page->post_type))),
        ];
    }

    /**
     * Resolve an attachment's caption for an ImageObject: its WordPress caption,
     * falling back to the alt text, and null when neither is set (matches Yoast).
     *
     * @param int $attachment_id
     *
     * @return string|null
     */
    protected function imageCaption(int $attachment_id): ?string
    {
        $caption = wp_get_attachment_caption($attachment_id);
        if (!empty($caption)) return $caption;

        $alt = get_post_meta($attachment_id, '_wp_attachment_image_alt', true);
        return !empty($alt) ? $alt : null;
    }

    /**
     * Generate Organization JSON-LD piece for site identity.
     *
     * @return array
     */
    protected function organizationIdentityLd(): array
    {
        $org = $this->settings->identity->organization;

        $data = [
            '@type' => 'Organization',
            '@id'   => $this->organizationId(),
            'url'   => $this->settings->getBaseUrl(),
            'name'  => $org->getName(),
        ];

        if (!empty($org->getAlternateName())) {
            $data['alternateName'] = $org->getAlternateName();
        }

        if (!empty($org->getSlogan())) {
            $data['slogan'] = $org->getSlogan();
        }

        if (!empty($org->getDescription())) {
            $data['description'] = $org->getDescription();
        }

        if (!empty($org->getEmail())) {
            $data['email'] = $org->getEmail();
        }

        if (!empty($org->getPhone())) {
            $data['telephone'] = $org->getPhone();
        }

        if (!empty($org->getLegalName())) {
            $data['legalName'] = $org->getLegalName();
        }

        if (!empty($org->getFoundingDate())) {
            $data['foundingDate'] = $org->getFoundingDate();
        }

        $extra = $org->getData();

        $identifier_map = [
            'vat_id'       => 'vatID',
            'tax_id'       => 'taxID',
            'iso6523_code' => 'iso6523Code',
            'duns'         => 'duns',
            'lei_code'     => 'leiCode',
            'naics'        => 'naics',
        ];

        foreach ($identifier_map as $setting_key => $schema_key) {
            if (!empty($extra[$setting_key])) {
                $data[$schema_key] = $extra[$setting_key];
            }
        }

        $emp_min = $org->getEmployeesMin();
        $emp_max = $org->getEmployeesMax();
        if (!empty($emp_min) || !empty($emp_max)) {
            $employees = ['@type' => 'QuantitativeValue'];
            if (!empty($emp_min)) $employees['minValue'] = $emp_min;
            if (!empty($emp_max)) $employees['maxValue'] = $emp_max;
            $data['numberOfEmployees'] = $employees;
        }

        $policy_map = [
            'publishing_principles'      => 'publishingPrinciples',
            'ownership_funding_info'     => 'ownershipFundingInfo',
            'actionable_feedback_policy' => 'actionableFeedbackPolicy',
            'corrections_policy'         => 'correctionsPolicy',
            'ethics_policy'              => 'ethicsPolicy',
            'diversity_policy'           => 'diversityPolicy',
            'diversity_staffing_report'  => 'diversityStaffingReport',
        ];

        foreach ($policy_map as $setting_key => $schema_key) {
            if (!empty($extra[$setting_key])) {
                $data[$schema_key] = $extra[$setting_key];
            }
        }

        $logo_url = !empty($org->getLogo()) ? wp_get_attachment_url($org->getLogo()) : false;

        if (!empty($logo_url)) {
            $logo_id = $this->logoImageId();

            $data['logo']  = $this->imageObjectLd($logo_id, $logo_url, ['caption' => $org->getName()]);
            $data['image'] = ['@id' => $logo_id];
        }

        if (!empty($org->getFounder())) {
            $founder         = $org->getFounder();
            $data['founder'] = ['@type' => 'Person', 'name' => $founder['name']];

            if (!empty($founder['social_profiles'])) {
                $data['founder']['sameAs'] = array_column($founder['social_profiles'], 'url');
            }
        }

        if (!empty($org->getSocialProfiles())) {
            $data['sameAs'] = array_column($org->getSocialProfiles(), 'url');
        }

        return $data;
    }

    /**
     * Generate Person JSON-LD piece for site identity.
     *
     * The site's representative person is a WordPress user; its identity (name,
     * description, avatar) derives from that account, with the profile photo and
     * social profiles from settings layered on top. Keyed by the same @id as the
     * user's author node so the two merge when they coincide. Empty only if the
     * configured user is missing/deleted (a user is required in settings).
     *
     * @return array
     */
    protected function personIdentityLd(): array
    {
        $user = $this->siteUser();
        if (!$user) return [];

        $person = $this->settings->identity->person;

        $data = [
            '@type' => ['Person', 'Organization'],
            '@id'   => $this->personId($user),
            'name'  => $user->display_name,
        ];

        $image_url = !empty($person->getImage())
            ? wp_get_attachment_url($person->getImage())
            : (get_avatar_url($user->ID, ['size' => 96]) ?: false);

        if (!empty($image_url)) {
            $data['image'] = $this->imageObjectLd($image_url, $image_url, ['caption' => $user->display_name]);
            $data['logo']  = ['@id' => $image_url];
        }

        if (!empty($user->description)) {
            $data['description'] = $user->description;
        }

        if (!empty($person->getSocialProfiles())) {
            $data['sameAs'] = array_column($person->getSocialProfiles(), 'url');
        }

        return $data;
    }

    /**
     * Generate Person JSON-LD piece for a post author.
     *
     * On an author archive the Person is the page's main entity, so callers pass
     * the ProfilePage URL to emit `mainEntityOfPage`; a post byline omits it (the
     * page's main entity there is the WebPage/Article, not the author).
     *
     * @param WP_User     $user
     * @param string|null $main_entity_url ProfilePage URL, when this is an author archive.
     *
     * @return array
     */
    public function personAuthorLd(WP_User $user, ?string $main_entity_url = null): array
    {
        $data = [
            '@type' => 'Person',
            '@id'   => $this->personId($user),
            'name'  => $user->display_name,
        ];

        if (!empty($this->settings->authors->getEnabled())) {
            $data['url'] = $this->resolveAuthorUrl($user);
        }

        $avatar_url = get_avatar_url($user->ID, ['size' => 96]);
        if (!empty($avatar_url)) {
            $data['image'] = $this->imageObjectLd($avatar_url, $avatar_url, ['caption' => $user->display_name]);
        }

        if (!empty($user->description)) {
            $data['description'] = $user->description;
        }

        if (!empty($main_entity_url)) {
            $data['mainEntityOfPage'] = ['@id' => trailingslashit($main_entity_url)];
        }

        $social_profiles = get_user_meta($user->ID, 'kizlo_social_profiles', true);

        $sameAs = [];
        if (!empty($user->user_url)) array_push($sameAs, $user->user_url);
        if (!empty($social_profiles)) array_push($sameAs, ...array_column($social_profiles, 'url'));
        if (!empty($sameAs)) $data['sameAs'] = $sameAs;

        $gender = get_user_meta($user->ID, 'kizlo_gender', true);
        if (!empty($gender)) {
            $data['gender'] = $gender;
        }

        $knows_about = get_user_meta($user->ID, 'kizlo_knows_about', true);
        if (!empty($knows_about)) {
            $data['knowsAbout'] = $knows_about;
        }

        $knows_language = get_user_meta($user->ID, 'kizlo_knows_language', true);
        if (!empty($knows_language)) {
            $data['knowsLanguage'] = $knows_language;
        }

        $job_title = get_user_meta($user->ID, 'kizlo_job_title', true);
        if (!empty($job_title)) {
            $data['jobTitle'] = $job_title;
        }

        if ($this->settings->identity->isOrganization()) {
            $data['worksFor'] = ['@id' => $this->publisherId()];
        }

        return $data;
    }

    /**
     * Get the site language.
     *
     * @return string
     */
    protected function language(): string
    {
        return get_bloginfo('language');
    }

    /**
     * The WordPress user the site is represented by, when identity is "person".
     *
     * @return WP_User|null
     */
    protected function siteUser(): ?WP_User
    {
        $user_id = $this->settings->identity->person->getUserId();
        if (empty($user_id)) return null;

        return get_userdata($user_id) ?: null;
    }

    /**
     * Whether the given user is the site's representative person. Only true in
     * person identity mode, and drives the author/identity node merge: when a
     * post (or author archive) belongs to this user, the standalone identity
     * node already represents them, so no separate author node is emitted.
     *
     * @param WP_User $user
     *
     * @return bool
     */
    protected function isSitePerson(WP_User $user): bool
    {
        if (!$this->settings->identity->isPerson()) return false;

        $site_user = $this->siteUser();
        return $site_user !== null && $site_user->ID === $user->ID;
    }

    /**
     * Publisher @id: the Organization, or the person standing in for it in
     * person mode. A user is required for person identity (enforced in settings),
     * so an empty return only happens if that user is later deleted or missing —
     * callers omit the ref rather than emit a dangling @id.
     *
     * @return string
     */
    protected function publisherId(): string
    {
        if ($this->settings->identity->isOrganization()) {
            return $this->organizationId();
        }

        $user = $this->siteUser();
        return $user ? $this->personId($user) : '';
    }

    /**
     * @id for the WebSite node.
     *
     * @return string
     */
    protected function webSiteId(): string
    {
        return $this->settings->getBaseUrl() . '#website';
    }

    /**
     * @id for the Organization identity node.
     *
     * @return string
     */
    protected function organizationId(): string
    {
        return $this->settings->getBaseUrl() . '#organization';
    }

    /**
     * @id for the organization logo ImageObject (a singleton per site).
     *
     * @return string
     */
    protected function logoImageId(): string
    {
        return $this->settings->getBaseUrl() . '#/schema/logo/image/';
    }

    /**
     * @id for a person node, keyed by the WordPress user so the site's
     * representative person and a post's author collapse to a single node when
     * they are the same account.
     *
     * @param WP_User $user
     *
     * @return string
     */
    protected function personId(WP_User $user): string
    {
        return $this->settings->getBaseUrl() . '#/schema/person/' . md5($user->user_login . $user->ID);
    }

    /**
     * Extracts the origin url from given absolute url.
     * 
     * @param string $url
     * 
     * @return string
     */
    protected function getOrigin(string $url): string
    {
        $parsed = parse_url($url);
        $origin = $parsed['scheme'] . '://' . $parsed['host'];

        if (!empty($parsed['port'])) {
            $origin .= ':' . $parsed['port'];
        }

        return $origin;
    }

    /**
     * Join a base URL with one or more path segments.
     *
     * @param  string ...$parts Path segments to append.
     * @return string
     */
    protected function resolveUrl(string $base, string ...$parts): string
    {
        $url = untrailingslashit($base);

        foreach ($parts as $part) {
            $url .= '/' . trim($part, '/');
        }

        return trailingslashit($url);
    }

    /**
     * Resolve a template string for a post using post-specific context variables.
     *
     * @param  string  $template
     * @param  WP_Post $post
     * @return string
     */
    protected function resolvePostTemplate(string $template, WP_Post $post, array $extra = []): string
    {
        $author = get_userdata((int) $post->post_author);

        return Variables::resolve($template, array_merge($extra, [
            'title'         => get_the_title($post),
            'slug'          => $post->post_name,
            'id'            => $post->ID,
            'date'          => get_the_date('', $post),
            'modified_date' => get_the_modified_date('', $post),
            'year'          => get_the_date('Y', $post),
            'month'         => get_the_date('m', $post),
            'day'           => get_the_date('d', $post),
            'author'        => $author->display_name ?? '',
            'excerpt'       => $post->post_excerpt,
            'content'       => wp_trim_excerpt('', $post),
            'category'      => get_the_category($post->ID)[0]->name ?? '',
        ]), $this->settings->site);
    }

    /**
     * Resolve a template string for a term using taxonomy-specific context variables.
     *
     * @param  string  $template
     * @param  WP_Term $term
     * @return string
     */
    protected function resolveTermTemplate(string $template, WP_Term $term): string
    {
        return Variables::resolve($template, [
            'title'       => $term->name,
            'slug'        => $term->slug,
            'id'          => $term->term_id,
            'description' => $term->description ?: '',
        ], $this->settings->site);
    }

    /**
     * Resolve a template string for an author using author-specific context variables.
     *
     * @param  string  $template
     * @param  WP_User $user
     * @return string
     */
    protected function resolveAuthorTemplate(string $template, WP_User $user): string
    {
        return Variables::resolve($template, [
            'name'        => $user->display_name,
            'first_name'  => $user->first_name,
            'last_name'   => $user->last_name,
            'nicename'    => $user->user_nicename,
            'id'          => $user->ID,
            'bio'         => $user->description ?: '',
            'job_title'   => get_user_meta($user->ID, 'kizlo_job_title', true) ?: '',
            'post_count'  => count_user_posts($user->ID),
            'slug'        => $user->user_nicename
        ], $this->settings->site);
    }

    /**
     * Resolve the full archive URL for a given author.
     * Uses configured pathname structure if set, otherwise falls back to WordPress author URL
     * with the site origin replaced by the configured base URL origin.
     *
     * @param  WP_User $user
     * @return string
     */
    protected function resolveAuthorUrl(WP_User $user): string
    {
        $authors = $this->settings->authors;

        if ($authors->getPathnameStructure()) {
            $resolved_path = $this->resolveAuthorTemplate(
                $authors->getPathnameStructure(),
                $user
            );

            return $this->resolveUrl($this->settings->getBaseUrl(), $resolved_path);
        }

        $wp_author_url = get_author_posts_url($user->ID);

        return $this->resolveUrl(
            $this->settings->getBaseUrl(),
            str_replace($this->getOrigin($wp_author_url), '', $wp_author_url)
        );
    }

    /**
     * Resolve the full URL for a given post.
     * Uses configured pathname structure if set, otherwise falls back to WordPress permalink
     * with the site origin replaced by the configured base URL.
     *
     * @param  WP_Post          $post
     * @param  PostTypeSettings $post_type_settings
     * @return string
     */
    protected function resolvePostUrl(WP_Post $post, PostTypeSettings $post_type_settings): string
    {
        if ($post_type_settings->getPathnameStructure()) {
            $resolved_path = $this->resolvePostTemplate(
                $post_type_settings->getPathnameStructure(),
                $post
            );

            return $this->resolveUrl($this->settings->getBaseUrl(), $resolved_path);
        }

        $wp_permalink = get_permalink($post);

        return $this->resolveUrl(
            $this->settings->getBaseUrl(),
            str_replace($this->getOrigin($wp_permalink), '', $wp_permalink)
        );
    }

    /**
     * Resolve the full URL for a given term.
     * Uses configured pathname structure if set, otherwise falls back to WordPress term link
     * with the site origin replaced by the configured base URL.
     *
     * @param  WP_Term          $term
     * @param  TaxonomySettings $taxonomy_settings
     * @return string
     */
    protected function resolveTermUrl(WP_Term $term, TaxonomySettings $taxonomy_settings): string
    {
        if ($taxonomy_settings->getPathnameStructure()) {
            $resolved_path = $this->resolveTermTemplate(
                $taxonomy_settings->getPathnameStructure(),
                $term
            );

            return $this->resolveUrl($this->settings->getBaseUrl(), $resolved_path);
        }

        $wp_term_link = get_term_link($term);

        return $this->resolveUrl(
            $this->settings->getBaseUrl(),
            str_replace($this->getOrigin($wp_term_link), '', $wp_term_link)
        );
    }
}
