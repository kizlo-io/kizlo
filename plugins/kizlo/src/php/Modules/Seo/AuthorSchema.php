<?php

namespace Kizlo\Modules\Seo;

use WP_User;
use Kizlo\Support\Variables;

class AuthorSchema extends SeoBase
{
    // ====================================================
    // SITEMAP
    // ====================================================

    /**
     * Build sitemap entries for authors.
     *
     * @param int $page
     *
     * @return array
     */
    public function sitemapEntries(int $page = 1): array
    {
        if (!$this->settings->authors->getEnabled() || !$this->settings->authors->getSearchEngineVisibility()) {
            return [];
        }

        $users = get_users([
            'has_published_posts' => true,
            'number'              => self::SITEMAP_PER_PAGE,
            'offset'              => ($page - 1) * self::SITEMAP_PER_PAGE,
            'orderby'             => 'registered',
            'order'               => 'DESC',
            'fields'              => 'all',
        ]);

        if (empty($users)) return [];

        $entries = [];

        foreach ($users as $user) {
            $url = $this->resolveAuthorUrl($user);

            $posts = get_posts([
                'post_type'      => 'any',
                'post_status'    => 'publish',
                'posts_per_page' => 1,
                'orderby'        => 'modified',
                'order'          => 'DESC',
                'fields'         => 'ids',
                'author'         => $user->ID,
            ]);

            $lastmod    = !empty($posts) ? get_post_modified_time('c', true, $posts[0]) : null;
            $avatar_url = get_avatar_url($user->ID, ['size' => 96]) ?: null;

            $entries[] = [
                'loc'     => trailingslashit($url),
                'lastmod' => $lastmod,
                'images'  => $avatar_url ? [['loc' => $avatar_url, 'title' => $user->display_name]] : [],
            ];
        }

        return $entries;
    }

    // ====================================================
    // META
    // ====================================================

    /**
     * Build SEO meta data for an author archive.
     *
     * @param WP_User $user
     *
     * @return array
     */
    public function buildMeta(WP_User $user): array
    {
        $url        = $this->resolveAuthorUrl($user);
        $avatar_url = get_avatar_url($user->ID, ['size' => 1200]) ?: null;
        $title      = $this->getAuthorTitle($user);
        $description = $this->getAuthorDescription($user);

        return [
            'title'     => $title,
            'canonical' => trailingslashit($url),
            'robots'    => $this->buildRobots($this->settings->authors->getEnabled() && $this->settings->authors->getSearchEngineVisibility()),
            'og'        => $this->buildOg([
                'type'        => 'profile',
                'title'       => $title,
                'description' => $description,
                'url'         => trailingslashit($url),
                'image'       => $avatar_url ? [
                    'url'    => $avatar_url,
                    'width'  => null,
                    'height' => null,
                    'type'   => null,
                    'alt'    => $user->display_name,
                ] : null,
            ]),
            'twitter'   => $this->buildTwitter([
                'title'       => $title,
                'description' => $description,
                'image'       => $avatar_url,
                'image_alt'   => $user->display_name,
            ]),
            'article'   => null,
        ];
    }

    // ====================================================
    // JSON LD
    // ====================================================

    /**
     * Build author graph pieces into the graph array.
     *
     * @param WP_User $user
     *
     * @return array
     */
    public function jsonLd(WP_User $user): array
    {
        $graph = $this->baseGraph();

        $graph[] = $this->authorWebPageLd($user);
        $graph[] = $this->authorBreadcrumbLd($user);

        // The Person is the main entity of its own ProfilePage.
        $profile_url = trailingslashit($this->resolveAuthorUrl($user));

        if ($this->isSitePerson($user)) {
            // In person mode the identity node from baseGraph() already represents
            // this author (same @id); mark that node as the page's main entity in
            // place rather than emitting a duplicate.
            $person_id = $this->personId($user);
            foreach ($graph as &$node) {
                if (($node['@id'] ?? null) === $person_id) {
                    $node['mainEntityOfPage'] = ['@id' => $profile_url];
                    break;
                }
            }
            unset($node);
        } else {
            $graph[] = $this->personAuthorLd($user, $profile_url);
        }

        return $this->toGraph($graph);
    }

    /**
     * Generate WebPage JSON-LD piece for an author archive.
     *
     * @param WP_User $user
     *
     * @return array
     */
    public function authorWebPageLd(WP_User $user): array
    {
        $url = $this->resolveAuthorUrl($user);

        return parent::webPageLd([
            'url'            => $url,
            'title'          => $this->getAuthorTitle($user),
            'description'    => $this->getAuthorDescription($user),
            'image_url'      => null,
            'date_published' => null,
            'date_modified'  => null,
            'breadcrumb_id'  => trailingslashit($url) . '#breadcrumb',
            'webpage_type'   => 'ProfilePage',
            'article_type'   => null,
        ]);
    }

    /**
     * Generate BreadcrumbList JSON-LD piece for an author archive.
     *
     * @param WP_User $user
     *
     * @return array
     */
    public function authorBreadcrumbLd(WP_User $user): array
    {
        // Author archives have no real ancestors; only configured rows apply.
        return $this->buildBreadcrumbLd(
            $this->resolveAuthorUrl($user),
            $user->display_name,
            $this->settings->authors->getBreadcrumbs(),
            [],
        );
    }

    /**
     * Resolve the SEO title for an author archive page.
     *
     * @param  WP_User $user
     * @return string
     */
    private function getAuthorTitle(WP_User $user): string
    {
        return $this->resolveAuthorTemplate(
            $this->settings->authors->getTitleStructure() ?? Variables::DEFAULT_AUTHOR_TITLE_TEMPLATE,
            $user
        );
    }

    /**
     * Resolve the SEO description for an author archive page.
     *
     * @param  WP_User $user
     * @return ?string
     */
    private function getAuthorDescription(WP_User $user): ?string
    {
        return $this->resolveAuthorTemplate(
            $this->settings->authors->getDescriptionStructure() ?? Variables::DEFAULT_AUTHOR_DESC_TEMPLATE,
            $user
        ) ?: null;
    }
}
