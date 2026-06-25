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

        $posts = get_posts([
            'post_type'      => $post_type,
            'post_status'    => 'publish',
            'posts_per_page' => self::SITEMAP_PER_PAGE,
            'offset'         => ($page - 1) * self::SITEMAP_PER_PAGE,
            'orderby'        => 'modified',
            'order'          => 'DESC',
            'fields'         => 'ids',
        ]);

        if (empty($posts)) return [];

        $entries = [];

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

        $url           = $this->resolvePostUrl($post, $post_type_settings);
        $thumbnail_url = get_the_post_thumbnail_url($post, 'full') ?: null;
        $thumbnail_id  = get_post_thumbnail_id($post->ID);
        $author        = get_userdata((int) $post->post_author);

        $title       =  $this->getPostTitle($post, $post_type_settings);
        $description =  $this->getPostDescription($post, $post_type_settings);

        $image = null;
        if ($thumbnail_url) {
            $metadata = wp_get_attachment_metadata($thumbnail_id);

            if (!empty($metadata)) {
                $image    = [
                    'url'    => $thumbnail_url,
                    // wp_get_attachment_metadata() omits width/height for non-image
                    // attachments; WP stubs type the shape as always-present.
                    // @phpstan-ignore nullCoalesce.offset
                    'width'  => $metadata['width']  ?? null,
                    // @phpstan-ignore nullCoalesce.offset
                    'height' => $metadata['height'] ?? null,
                    'type'   => get_post_mime_type($thumbnail_id) ?: null,
                    'alt'    => get_post_meta($thumbnail_id, '_wp_attachment_image_alt', true) ?: null,
                ];
            }
        }

        $tags    = get_the_tags($post->ID);
        $section = get_the_category($post->ID)[0]->name ?? null;

        $is_article_type = !empty($post_type_settings->getArticleType()) && $post_type_settings->getArticleType() !== 'none';

        return [
            'title'     => $title,
            'canonical' => trailingslashit($url),
            'robots'    => $this->buildRobots($post_type_settings->getSearchEngineVisibility()),
            'og'        => $this->buildOg([
                'type'        => 'article',
                'title'       => $title,
                'description' => $description,
                'url'         => trailingslashit($url),
                'image'       => $image,
            ]),
            'twitter'   => $this->buildTwitter([
                'title'       => $title,
                'description' => $description,
                'image'       => $thumbnail_url,
                'image_alt'   => $image['alt'] ?? null,
            ]),
            'article'   =>  $is_article_type ? $this->buildArticleMeta([
                'published_time' => get_the_date('c', $post),
                'modified_time'   => get_the_modified_date('c', $post),
                'author'         => $author->display_name ?? null,
                'author_url'     => $author ? $this->resolveAuthorUrl($author) : null,
                'section'        => $section,
                'tags'           => $tags && !is_wp_error($tags) ? array_map(fn($tag) => $tag->name, $tags) : [],
            ]) : null,
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

        $image = $this->imageObjectLd($post);
        if (!empty($image)) $graph[] = $image;

        $graph[] = $this->breadcrumbLd($post);

        $author = get_userdata((int) $post->post_author);

        if ($author) {
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
            'webpage_type'   => $post_type_settings->getWebpageType(),
            'article_type'   => $post_type_settings->getArticleType() ?? null,
        ]);
    }

    private function getPostTitle(WP_Post $post, PostTypeSettings $post_type_settings): string
    {
        return $this->resolvePostTemplate($post_type_settings->getTitleStructure() ?? Variables::DEFAULT_POST_TITLE_TEMPLATE, $post);
    }

    private function getPostDescription(WP_Post $post, PostTypeSettings $post_type_settings): ?string
    {
        return $this->resolvePostTemplate($post_type_settings->getDescriptionStructure() ?? Variables::DEFAULT_POST_DESC_TEMPLATE, $post) ?: null;
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

        if (empty($post_type_settings->getArticleType()) || $post_type_settings->getArticleType() === 'none') {
            return [];
        }

        $page_url = trailingslashit($this->resolvePostUrl($post, $post_type_settings));

        $data = [
            '@type'            => $post_type_settings->getArticleType() !== 'Article' ? ['Article', $post_type_settings->getArticleType()] : 'Article',
            '@id'              => $page_url . '#article',
            'isPartOf'         => ['@id' => $page_url],
            'mainEntityOfPage' => ['@id' => $page_url],
            'headline'         => get_the_title($post),
            'datePublished'    => get_the_date('c', $post),
            'dateModified'     => get_the_modified_date('c', $post),
            'wordCount'        => str_word_count(wp_strip_all_tags($post->post_content)),
            'commentCount'     => (int) get_comments_number($post->ID),
            'inLanguage'       => $this->language(),
            'publisher'        => ['@id' => $this->publisherId()],
            'copyrightYear'    => get_the_date('Y', $post),
            'copyrightHolder'  => ['@id' => $this->publisherId()],
        ];

        $author = get_userdata((int) $post->post_author);
        if ($author) {
            $data['author'] = [
                'name' => $author->display_name,
                '@id'  => $this->schemaId('Person', md5($author->user_email)),
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

        if (comments_open($post->ID) && !empty($post_type_settings->getCommentActionStructure())) {
            $structure   = $post_type_settings->getCommentActionStructure();
            $pathname = trim(str_replace($this->settings->getBaseUrl(), '', trailingslashit($this->resolvePostUrl($post, $post_type_settings))), '/');
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
     * Generate BreadcrumbList JSON-LD piece for a post.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    public function breadcrumbLd(WP_Post $post): array
    {
        $post_type_settings = $this->settings->postTypes->get($post->post_type);

        $page_url = trailingslashit($this->resolvePostUrl($post, $post_type_settings));
        $position = 1;

        $items = [[
            '@type'    => 'ListItem',
            'position' => $position++,
            'name'     => 'Home',
            'item'     => $this->settings->getBaseUrl(),
        ]];

        foreach (array_reverse(get_post_ancestors($post)) as $ancestor_id) {
            $ancestor_post = get_post($ancestor_id);

            $items[] = [
                '@type'    => 'ListItem',
                'position' => $position++,
                'name'     => get_the_title($ancestor_id),
                'item'     => trailingslashit($this->resolvePostUrl($ancestor_post, $post_type_settings)),
            ];
        }

        $items[] = [
            '@type'    => 'ListItem',
            'position' => $position,
            'name'     => get_the_title($post),
        ];

        return [
            '@type'           => 'BreadcrumbList',
            '@id'             => $page_url . '#breadcrumb',
            'itemListElement' => $items,
        ];
    }

    /**
     * Generate ImageObject JSON-LD piece for a post's featured image.
     *
     * @param WP_Post $post
     *
     * @return array
     */
    public function imageObjectLd(WP_Post $post): array
    {
        $post_type_settings = $this->settings->postTypes->get($post->post_type);

        $page_url      = trailingslashit($this->resolvePostUrl($post, $post_type_settings));
        $thumbnail_id  = get_post_thumbnail_id($post->ID);
        $thumbnail_url = get_the_post_thumbnail_url($post, 'full');

        if (empty($thumbnail_url)) return [];

        $metadata = wp_get_attachment_metadata($thumbnail_id);

        return [
            '@type'      => 'ImageObject',
            '@id'        => $page_url . '#primaryimage',
            'url'        => $thumbnail_url,
            'contentUrl' => $thumbnail_url,
            'inLanguage' => $this->language(),
            'width'      => $metadata['width']  ?? null,
            'height'     => $metadata['height'] ?? null,
        ];
    }
}
