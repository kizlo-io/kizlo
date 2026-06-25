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

    public function __construct(protected Settings $settings) {}

    // ====================================================
    // ROBOTS
    // ====================================================

    public function robots(): array
    {
        $rules = [
            'user_agent' => '*',
            'allow'      => ['/'],
            'disallow'   => [],
        ];

        // Post types
        foreach ($this->settings->postTypes->all() as $postType) {
            if (!$postType->getSearchEngineVisibility() && $postType->getPathnameStructure()) {
                $rules['disallow'][] = $postType->getPathnameStructure();
            }
        }

        // Taxonomies
        foreach ($this->settings->taxonomies->all() as $taxonomy) {
            if (!$taxonomy->getSearchEngineVisibility() && $taxonomy->getPathnameStructure()) {
                $rules['disallow'][] = $taxonomy->getPathnameStructure();
            }
        }

        // Authors
        $authors = $this->settings->authors;
        if ((!$authors->getEnabled() || !$authors->getSearchEngineVisibility()) && $authors->getPathnameStructure()) {
            $rules['disallow'][] = $authors->getPathnameStructure();
        }

        // Custom rules
        $customRules = $this->settings->crawling->robots->getCustomRules();
        if (!empty($customRules)) {
            $result = ['rules' => $customRules];
        } else {
            $result = ['rules' => [$rules]];
        }

        // Sitemap
        if ($this->settings->crawling->robots->getIncludeSitemap()) {
            $sitemapPathname  = $this->settings->crawling->sitemaps->getPathnameStructure();
            $result['sitemaps'] = [untrailingslashit($this->resolveUrl($this->settings->getBaseUrl(), $sitemapPathname))];
        }

        return $result;
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

        foreach ($this->settings->postTypes->all() as $post_type_slug => $post_type) {
            if (! $post_type->getSearchEngineVisibility()) continue;

            $count = wp_count_posts($post_type_slug)->publish ?? 0;
            if ($count === 0) continue;

            $pages   = (int) ceil($count / self::SITEMAP_PER_PAGE);
            $lastmod = $this->getPostTypeLastMod($post_type_slug);

            $entries[] = [
                'key'     => $post_type_slug,
                'type'    => 'post_type',
                'pages'   => $pages,
                'lastmod' => $lastmod,
            ];
        }

        foreach ($this->settings->taxonomies->all() as $taxonomy_slug => $taxonomy) {
            if (! $taxonomy->getSearchEngineVisibility()) continue;

            $count = wp_count_terms(['taxonomy' => $taxonomy_slug, 'hide_empty' => true]);
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
            $count = count_users()['total_users'];

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
     * Get the last modified date of the most recent post in a post type.
     *
     * @param string $post_type
     *
     * @return string|null
     */
    private function getPostTypeLastMod(string $post_type): ?string
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

        // Terms don't have modified date natively so use most recent post in taxonomy
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
     *
     * @return array
     */
    protected function buildRobots(bool $indexable): array
    {
        return [
            'index'             => $indexable ? 'index' : 'noindex',
            'follow'            => 'follow',
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

    // ====================================================
    // JSON LD
    // ====================================================

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
            '@id'        => $this->schemaId('WebSite'),
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

        $data['publisher']       = ['@id' => $this->publisherId()];
        $data['copyrightHolder'] = ['@id' => $this->publisherId()];

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
            'isPartOf'   => ['@id' => $this->schemaId('WebSite')],
            'inLanguage' => $this->language(),
        ];

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
     * Generate Organization JSON-LD piece for site identity.
     *
     * @return array
     */
    protected function organizationIdentityLd(): array
    {
        $org = $this->settings->identity->organization;

        $data = [
            '@type' => ['Organization', 'Brand'],
            '@id'   => $this->schemaId('Organization'),
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

        if (!empty($org->getEmployees())) {
            $data['numberOfEmployees'] = $org->getEmployees();
        }

        $logo_url = !empty($org->getLogo()) ? wp_get_attachment_url($org->getLogo()) : false;

        if (!empty($logo_url)) {
            $data['logo'] = [
                '@type'      => 'ImageObject',
                '@id'        => $this->schemaId('logo/image', md5((string) $org->getLogo())),
                'url'        => $logo_url,
                'contentUrl' => $logo_url,
                'inLanguage' => $this->language(),
                'caption'    => $this->settings->identity->organization->getName(),
            ];

            $data['image'] = [
                '@id' => $this->schemaId('logo/image', md5((string) $org->getLogo()))
            ];
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
     * @return array
     */
    protected function personIdentityLd(): array
    {
        $person = $this->settings->identity->person;

        $data = [
            '@type' => ['Person', 'Organization'],
            '@id'   => $this->schemaId('Person'),
            'name'  => $person->getName(),
        ];

        $image_url = !empty($person->getImage()) ? wp_get_attachment_url($person->getImage()) : false;

        if (!empty($image_url)) {
            $data['image'] = [
                '@type'      => 'ImageObject',
                '@id'        => $image_url,
                'url'        => $image_url,
                'contentUrl' => $image_url,
                'inLanguage' => $this->language(),
                'caption'    => $person->getName(),
            ];
            $data['logo'] = ['@id' => $image_url];
        }

        if (!empty($person->getSocialProfiles())) {
            $data['sameAs'] = array_column($person->getSocialProfiles(), 'url');
        }

        return $data;
    }

    /**
     * Generate Person JSON-LD piece for a post author.
     *
     * @param WP_User $user
     *
     * @return array
     */
    public function personAuthorLd(WP_User $user): array
    {
        $data = [
            '@type' => 'Person',
            '@id'   => $this->schemaId('Person', md5($user->user_email)),
            'name'  => $user->display_name,
        ];

        if (!empty($this->settings->authors->getEnabled())) {
            $data['url'] = $this->resolveAuthorUrl($user);
        }

        $avatar_url = get_avatar_url($user->ID, ['size' => 96]);
        if (!empty($avatar_url)) {
            $data['image'] = [
                '@type'      => 'ImageObject',
                '@id'        => $avatar_url,
                'url'        => $avatar_url,
                'contentUrl' => $avatar_url,
                'inLanguage' => $this->language(),
                'caption'    => $user->display_name,
            ];
        }

        if (!empty($user->description)) {
            $data['description'] = $user->description;
        }

        // TODO: Get social profiles from user metabox.
        $social_profiles = get_user_meta($user->ID, 'kizlo_social_profiles', true);

        $sameAs = [];
        if (!empty($user->user_url)) array_push($sameAs, $user->user_url);
        if (!empty($social_profiles)) array_push($sameAs, ...array_column($social_profiles, 'url'));
        if (!empty($sameAs)) $data['sameAs'] = $sameAs;

        // TODO: Get gender from user metabox.
        $gender = get_user_meta($user->ID, 'kizlo_gender', true);
        if (!empty($gender)) {
            $data['gender'] = $gender;
        }

        // TODO: Get knows about from user metabox.
        $knows_about = get_user_meta($user->ID, 'kizlo_knows_about', true);
        if (!empty($knows_about)) {
            $data['knowsAbout'] = $knows_about;
        }

        // TODO: Get knows language from user metabox.
        $knows_language = get_user_meta($user->ID, 'kizlo_knows_language', true);
        if (!empty($knows_language)) {
            $data['knowsLanguage'] = $knows_language;
        }

        // TODO: Get job title from user metabox.
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
     * Get the publisher @id based on identity type.
     *
     * @return string
     */
    protected function publisherId(): string
    {
        return $this->settings->identity->isOrganization() ? $this->schemaId('Organization') : $this->schemaId('Person');
    }

    /**
     * Generate a schema @id URL.
     *
     * @param string     $type
     * @param string|int $identifier
     *
     * @return string
     */
    protected function schemaId(string $type, string|int $identifier = 1): string
    {
        $id = $this->settings->getBaseUrl() . '#/schema/' . $type;
        return empty($identifier) ? trailingslashit($id) : $id . '/' . $identifier;
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
        return $parsed['scheme'] . '://' . $parsed['host'];
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
            'excerpt'       => get_the_excerpt($post) ?: '',
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
