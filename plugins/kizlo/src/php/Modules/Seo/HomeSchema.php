<?php

namespace Kizlo\Modules\Seo;

use WP_Post;
use Kizlo\Support\Variables;

class HomeSchema extends SeoBase
{
    /**
     * Build SEO meta data for the homepage.
     *
     * @return array
     */
    public function buildMeta(): array
    {
        $overrides   = $this->homeOverrides();
        $front_page  = $this->frontPage();

        $title       = $this->homeTitle($overrides, $front_page);
        $description = $this->homeDescription($overrides, $front_page);

        $canonical   = !empty($overrides['canonical']) ? trailingslashit($overrides['canonical']) : $this->settings->getBaseUrl();
        $indexable   = empty($overrides['noindex']);
        $nofollow    = !empty($overrides['nofollow']);

        $article_type = $front_page ? $this->effectiveArticleType($front_page) : null;
        $is_article   = !empty($article_type) && $article_type !== 'none';

        $social = $this->resolveSocial(
            $overrides,
            $title,
            $description,
            $this->settings->site->getFallbackImage() ?: null,
            $front_page ? fn(string $template) => $this->resolvePostTemplate($template, $front_page) : fn(string $template) => $template,
        );

        return [
            'title'     => $title,
            'canonical' => $canonical,
            'robots'    => $this->buildRobots($indexable, $nofollow),
            'og'        => $this->buildOg([
                'type'        => $is_article ? 'article' : 'website',
                'title'       => $social['og']['title'],
                'description' => $social['og']['description'],
                'url'         => $this->settings->getBaseUrl(),
                'image'       => $social['og']['image'],
            ]),
            'twitter'   => $this->buildTwitter([
                'title'       => $social['twitter']['title'],
                'description' => $social['twitter']['description'],
                'image'       => $social['twitter']['image']['url'] ?? null,
                'image_alt'   => $social['twitter']['image']['alt'] ?? null,
            ]),
            'article'   => $is_article ? $this->articleMetaFor($front_page) : null,
        ];
    }

    /**
     * Build the full JSON-LD graph for the homepage.
     *
     * @return array
     */
    public function jsonLd(): array
    {
        $graph   = $this->baseGraph();
        $graph[] = $this->homeWebPageLd();
        $graph[] = $this->homeBreadcrumbLd();

        $front_page = $this->frontPage();
        if ($front_page) {
            $article_type = $this->effectiveArticleType($front_page);

            if (!empty($article_type) && $article_type !== 'none') {
                $graph[] = $this->buildArticleLd($front_page, trailingslashit($this->settings->getBaseUrl()), $article_type);
            }
        }

        $image = $this->homeImage($this->overrideImageId($this->homeOverrides()));
        if (!empty($image)) {
            $graph[] = $this->primaryImageLd(
                $this->settings->getBaseUrl(),
                $image['url'],
                $image['width'],
                $image['height'],
                $image['caption'],
            );
        }

        return $this->toGraph($graph);
    }

    /**
     * Generate WebPage JSON-LD piece for the homepage.
     *
     * @return array
     */
    protected function homeWebPageLd(): array
    {
        $overrides  = $this->homeOverrides();
        $front_page = $this->frontPage();
        $image      = $this->homeImage($this->overrideImageId($overrides));

        return $this->webPageLd([
            'url'            => $this->settings->getBaseUrl(),
            'title'          => $this->homeTitle($overrides, $front_page),
            'description'    => $this->homeDescription($overrides, $front_page),
            'image_url'      => $image['url'] ?? null,
            'date_published' => null,
            'date_modified'  => null,
            'breadcrumb_id'  => trailingslashit($this->settings->getBaseUrl()) . '#breadcrumb',
            'about'          => $this->publisherId(),
            'webpage_type'   => $front_page ? $this->effectiveWebpageType($front_page) : null,
            'article_type'   => null,
        ]);
    }

    /**
     * Generate the BreadcrumbList for the homepage: a single "Home" crumb (the
     * front page is both the root and the current page, so it carries no link).
     *
     * @return array
     */
    protected function homeBreadcrumbLd(): array
    {
        return [
            '@type'           => 'BreadcrumbList',
            '@id'             => trailingslashit($this->settings->getBaseUrl()) . '#breadcrumb',
            'itemListElement' => [[
                '@type'    => 'ListItem',
                'position' => 1,
                'name'     => __('Home', 'kizlo'),
            ]],
        ];
    }

    /**
     * Resolve the homepage image details, preferring a per-page override before
     * the site fallback image.
     *
     * @param int|null $override_id Attachment id set on the front page's SEO meta box.
     *
     * @return array{url: string, width: int|null, height: int|null, type: string|null, alt: string|null, caption: string|null}|null
     */
    protected function homeImage(?int $override_id = null): ?array
    {
        $id = $override_id ?: $this->settings->site->getFallbackImage();

        if (empty($id)) return null;

        $metadata = wp_get_attachment_metadata($id);

        return [
            'url'     => wp_get_attachment_url($id),
            'width'   => $metadata['width']  ?? null,
            'height'  => $metadata['height'] ?? null,
            'type'    => get_post_mime_type($id) ?: null,
            'alt'     => get_post_meta($id, '_wp_attachment_image_alt', true) ?: null,
            'caption' => $this->imageCaption($id),
        ];
    }

    /**
     * Resolve the homepage title, preferring the front page's override (resolved
     * as a template so variables still work) over the site name.
     *
     * @param array         $overrides
     * @param WP_Post|null  $front_page
     *
     * @return string
     */
    private function homeTitle(array $overrides, ?WP_Post $front_page): string
    {
        $site_name = $this->settings->site->getName() ?? get_bloginfo('name');

        if (!$front_page) return $site_name;

        $post_type = $this->settings->postTypes->get($front_page->post_type);
        $template  = !empty($overrides['title'])
            ? $overrides['title']
            : ($post_type->getTitleStructure() ?? Variables::DEFAULT_POST_TITLE_TEMPLATE);

        return $this->resolvePostTemplate($template, $front_page) ?: $site_name;
    }

    /**
     * Resolve the homepage description, preferring the front page's override over
     * the site tagline.
     *
     * @param array         $overrides
     * @param WP_Post|null  $front_page
     *
     * @return string|null
     */
    private function homeDescription(array $overrides, ?WP_Post $front_page): ?string
    {
        $tagline = $this->settings->site->getTagline() ?? get_bloginfo('description') ?: null;

        if (!$front_page) return $tagline;

        $post_type = $this->settings->postTypes->get($front_page->post_type);
        $template  = !empty($overrides['description'])
            ? $overrides['description']
            : ($post_type->getDescriptionStructure() ?? Variables::DEFAULT_POST_DESC_TEMPLATE);

        return $this->resolvePostTemplate($template, $front_page) ?: $tagline;
    }

    /**
     * Read the SEO overrides stored on the static front page. The homepage
     * otherwise resolves entirely from site settings, so this is only populated
     * when a page is assigned as the front page.
     *
     * @return array
     */
    private function homeOverrides(): array
    {
        $front_page = $this->frontPage();

        return $front_page ? $this->postSeoOverrides($front_page) : [];
    }

    /**
     * The static front page post, or null when the homepage lists latest posts.
     *
     * @return WP_Post|null
     */
    private function frontPage(): ?WP_Post
    {
        if (get_option('show_on_front') !== 'page') return null;

        $id = (int) get_option('page_on_front');
        if ($id <= 0) return null;

        return get_post($id) ?: null;
    }

    /**
     * Extract the override image id from a SEO override array, if present.
     *
     * @param array $overrides
     *
     * @return int|null
     */
    private function overrideImageId(array $overrides): ?int
    {
        return !empty($overrides['og_image_id']) ? (int) $overrides['og_image_id'] : null;
    }
}
