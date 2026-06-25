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

        $url         = $this->resolveTermUrl($term, $taxonomy_settings);
        $title       = $this->getTermTitle($term, $taxonomy_settings);
        $description = $this->getTermDescription($term, $taxonomy_settings);

        return [
            'title'     => $title,
            'canonical' => trailingslashit($url),
            'robots'    => $this->buildRobots($taxonomy_settings->getSearchEngineVisibility()),
            'og'        => $this->buildOg([
                'type'        => 'website',
                'title'       => $title,
                'description' => $description,
                'url'         => trailingslashit($url),
                'image'       => null,
            ]),
            'twitter'   => $this->buildTwitter([
                'title'       => $title,
                'description' => $description,
                'image'       => null,
                'image_alt'   => null,
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
        return $this->resolveTermTemplate(
            $taxonomy_settings->getTitleStructure() ?? Variables::DEFAULT_TAX_TITLE_TEMPLATE,
            $term
        );
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
        return $this->resolveTermTemplate(
            $taxonomy_settings->getDescriptionStructure() ?? Variables::DEFAULT_TAX_DESC_TEMPLATE,
            $term
        ) ?: null;
    }
}
