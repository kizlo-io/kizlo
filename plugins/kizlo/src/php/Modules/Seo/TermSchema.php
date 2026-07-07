<?php

namespace Kizlo\Modules\Seo;

use WP_Term;
use Kizlo\Support\Variables;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;

class TermSchema extends SeoBase
{
    // ====================================================
    // SITEMAP
    // ====================================================

    /**
     * Build sitemap entries for a taxonomy.
     *
     * @param string $taxonomy
     * @param int    $page
     *
     * @return array
     */
    public function sitemapEntries(string $taxonomy, int $page = 1): array
    {
        $taxonomy_settings = $this->settings->taxonomies->get($taxonomy);

        if (!$taxonomy_settings->getSearchEngineVisibility()) {
            return [];
        }

        $terms = get_terms([
            'taxonomy'   => $taxonomy,
            'hide_empty' => true,
            'number'     => self::SITEMAP_PER_PAGE,
            'offset'     => ($page - 1) * self::SITEMAP_PER_PAGE,
            'orderby'    => 'count',
            'order'      => 'DESC',
        ]);

        if (empty($terms) || is_wp_error($terms)) return [];

        $entries = [];

        foreach ($terms as $term) {
            $url = $this->resolveTermUrl($term, $taxonomy_settings);

            $posts = get_posts([
                'post_type'      => 'any',
                'posts_per_page' => 1,
                'orderby'        => 'modified',
                'order'          => 'DESC',
                'fields'         => 'ids',
                'tax_query'      => [
                    [
                        'taxonomy' => $taxonomy,
                        'field'    => 'term_id',
                        'terms'    => $term->term_id,
                    ],
                ],
            ]);

            $entries[] = [
                'loc'     => trailingslashit($url),
                'lastmod' => !empty($posts) ? get_post_modified_time('c', true, $posts[0]) : null,
                'images'  => [],
            ];
        }

        return $entries;
    }

    // ====================================================
    // META
    // ====================================================

    /**
     * Build SEO meta data for a taxonomy term.
     *
     * @param WP_Term $term
     *
     * @return array
     */
    public function buildMeta(WP_Term $term): array
    {
        $taxonomy_settings = $this->settings->taxonomies->get($term->taxonomy);
        $overrides         = $this->termSeoOverrides($term);

        $url         = $this->resolveTermUrl($term, $taxonomy_settings);
        $title       = $this->getTermTitle($term, $taxonomy_settings);
        $description = $this->getTermDescription($term, $taxonomy_settings);

        $canonical = !empty($overrides['canonical']) ? trailingslashit($overrides['canonical']) : trailingslashit($url);
        $indexable = $taxonomy_settings->getSearchEngineVisibility() && empty($overrides['noindex']);
        $nofollow  = !empty($overrides['nofollow']);

        // Open Graph and Twitter fall back to the SEO title/description; a term
        // has no featured image, so the social image comes solely from an
        // override (og/twitter image), with Twitter falling back to Open Graph.
        $social = $this->resolveSocial(
            $overrides,
            $title,
            $description,
            null,
            fn(string $template) => $this->resolveTermTemplate($template, $term),
        );

        return [
            'title'     => $title,
            'canonical' => $canonical,
            'robots'    => $this->buildRobots($indexable, $nofollow),
            'og'        => $this->buildOg([
                'type'        => 'website',
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
            'article'   => null,
        ];
    }

    // ====================================================
    // JSON LD
    // ====================================================

    /**
     * Build term graph pieces into the graph array.
     *
     * @param WP_Term $term
     *
     * @return array
     */
    public function jsonLd(WP_Term $term): array
    {
        $graph   = $this->baseGraph();
        $graph[] = $this->termWebPageLd($term);
        $graph[] = $this->termBreadcrumbLd($term);

        return $this->toGraph($graph);
    }

    /**
     * Generate WebPage JSON-LD piece for a taxonomy term.
     *
     * @param WP_Term $term
     *
     * @return array
     */
    public function termWebPageLd(WP_Term $term): array
    {
        $taxonomy_settings = $this->settings->taxonomies->get($term->taxonomy);

        $url = $this->resolveTermUrl($term, $taxonomy_settings);

        return parent::webPageLd([
            'url'            => $url,
            'title'          => $this->getTermTitle($term, $taxonomy_settings),
            'description'    => $this->getTermDescription($term, $taxonomy_settings),
            'image_url'      => null,
            'date_published' => null,
            'date_modified'  => null,
            'breadcrumb_id'  => trailingslashit($url) . '#breadcrumb',
            'webpage_type'   => 'CollectionPage',
            'article_type'   => null,
        ]);
    }

    /**
     * Generate BreadcrumbList JSON-LD piece for a taxonomy term.
     *
     * @param WP_Term $term
     *
     * @return array
     */
    public function termBreadcrumbLd(WP_Term $term): array
    {
        $taxonomy_settings = $this->settings->taxonomies->get($term->taxonomy);

        $term_url = trailingslashit($this->resolveTermUrl($term, $taxonomy_settings));
        $position = 1;

        $items = [[
            '@type'    => 'ListItem',
            'position' => $position++,
            'name'     => __('Home', 'kizlo'),
            'item'     => $this->settings->getBaseUrl(),
        ]];

        $parent_id = $term->parent;
        $parents   = [];
        while ($parent_id) {
            $parent    = get_term($parent_id, $term->taxonomy);
            $parents[] = $parent;
            $parent_id = $parent->parent;
        }

        foreach (array_reverse($parents) as $parent) {
            $items[] = [
                '@type'    => 'ListItem',
                'position' => $position++,
                'name'     => $parent->name,
                'item'     => trailingslashit($this->resolveTermUrl($parent, $taxonomy_settings)),
            ];
        }

        $items[] = [
            '@type'    => 'ListItem',
            'position' => $position,
            'name'     => $term->name,
        ];

        return [
            '@type'           => 'BreadcrumbList',
            '@id'             => $term_url . '#breadcrumb',
            'itemListElement' => $items,
        ];
    }

    /**
     * Resolve the SEO title for a taxonomy term page.
     *
     * @param  WP_Term          $term
     * @param  TaxonomySettings $taxonomy_settings
     * @return string
     */
    private function getTermTitle(WP_Term $term, TaxonomySettings $taxonomy_settings): string
    {
        $override = $this->termSeoOverrides($term)['title'] ?? '';
        $template = $override !== '' ? $override : ($taxonomy_settings->getTitleStructure() ?? Variables::DEFAULT_TAX_TITLE_TEMPLATE);

        return $this->resolveTermTemplate($template, $term);
    }

    /**
     * Resolve the SEO description for a taxonomy term page.
     *
     * @param  WP_Term          $term
     * @param  TaxonomySettings $taxonomy_settings
     * @return ?string
     */
    private function getTermDescription(WP_Term $term, TaxonomySettings $taxonomy_settings): ?string
    {
        $override = $this->termSeoOverrides($term)['description'] ?? '';
        $template = $override !== '' ? $override : ($taxonomy_settings->getDescriptionStructure() ?? Variables::DEFAULT_TAX_DESC_TEMPLATE);

        return $this->resolveTermTemplate($template, $term) ?: null;
    }

    /**
     * Resolve the default (pre-override) SEO values for a term. Seeds the term
     * editor's placeholders so editors see what each field falls back to.
     *
     * @param WP_Term $term
     *
     * @return array{title: string, description: string, canonical: string, indexable: bool, webpage_type: string, article_type: string, og_image: null}
     */
    public function seoDefaults(WP_Term $term): array
    {
        $taxonomy_settings = $this->settings->taxonomies->get($term->taxonomy);

        $title = $this->resolveTermTemplate(
            $taxonomy_settings->getTitleStructure() ?? Variables::DEFAULT_TAX_TITLE_TEMPLATE,
            $term
        );
        $description = $this->resolveTermTemplate(
            $taxonomy_settings->getDescriptionStructure() ?? Variables::DEFAULT_TAX_DESC_TEMPLATE,
            $term
        ) ?: '';

        return [
            'title'        => $title,
            'description'  => $description,
            'canonical'    => trailingslashit($this->resolveTermUrl($term, $taxonomy_settings)),
            'indexable'    => (bool) $taxonomy_settings->getSearchEngineVisibility(),
            'webpage_type' => '',
            'article_type' => '',
            'og_image'     => null,
        ];
    }
}
