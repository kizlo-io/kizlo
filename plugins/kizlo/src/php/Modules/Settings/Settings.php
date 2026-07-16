<?php

namespace Kizlo\Modules\Settings;

use WP_Post;
use WP_Term;
use WP_User;
use Kizlo\Support\Variables;
use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\Modules\Settings\Brand\BrandSettings;
use Kizlo\Modules\Settings\Identity\IdentitySettings;
use Kizlo\Modules\Settings\Authors\AuthorsSettings;
use Kizlo\Modules\Settings\Crawling\CrawlingSettings;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Modules\Settings\PostType\PostTypeSettingsCollection;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettingsCollection;
use Kizlo\Modules\Settings\Integration\WebhookSettings;
use Kizlo\Modules\Settings\Uploads\UploadsSettings;

class Settings
{
    public readonly SiteSettings               $site;
    public readonly BrandSettings              $brand;
    public readonly IdentitySettings           $identity;
    public readonly AuthorsSettings            $authors;
    public readonly PostTypeSettingsCollection $postTypes;
    public readonly TaxonomySettingsCollection $taxonomies;
    public readonly WebhookSettings            $webhook;
    public readonly CrawlingSettings           $crawling;
    public readonly UploadsSettings            $uploads;

    private function __construct(
        SiteSettings               $site,
        BrandSettings              $brand,
        IdentitySettings           $identity,
        AuthorsSettings            $authors,
        PostTypeSettingsCollection $postTypes,
        TaxonomySettingsCollection $taxonomies,
        CrawlingSettings           $crawling,
        WebhookSettings            $webhook,
        UploadsSettings            $uploads,
    ) {
        $this->site       = $site;
        $this->brand      = $brand;
        $this->identity   = $identity;
        $this->authors    = $authors;
        $this->postTypes  = $postTypes;
        $this->taxonomies = $taxonomies;
        $this->crawling   = $crawling;
        $this->webhook    = $webhook;
        $this->uploads    = $uploads;
    }

    /**
     * Load all settings fresh from the database.
     */
    public static function load(): static
    {
        $post_types = [];
        foreach (PostTypeSettings::getAvailableObjects() as $post_type_name) {
            $post_types[$post_type_name->name] = PostTypeSettings::load($post_type_name->name);
        }

        $taxonomies = [];
        foreach (TaxonomySettings::getAvailableObjects() as $taxonomy_name) {
            $taxonomies[$taxonomy_name->name] = TaxonomySettings::load($taxonomy_name->name);
        }

        // @phpstan-ignore new.static
        return new static(
            site: SiteSettings::load(),
            brand: BrandSettings::load(),
            identity: IdentitySettings::load(),
            authors: AuthorsSettings::load(),
            postTypes: new PostTypeSettingsCollection($post_types),
            taxonomies: new TaxonomySettingsCollection($taxonomies),
            crawling: CrawlingSettings::load(),
            webhook: WebhookSettings::load(),
            uploads: UploadsSettings::load(),
        );
    }

    /**
     * Load all settings from transient cache, falling back to fresh load.
     * Cache is rebuilt automatically on miss.
     */
    public static function cached(): static
    {
        $cache = SettingsCache::get();

        if ($cache !== false) {
            $post_types = array_map(fn($data) => new PostTypeSettings($data), $cache['post_types']);
            $taxonomies = array_map(fn($data) => new TaxonomySettings($data), $cache['taxonomies']);

            // @phpstan-ignore new.static
            return new static(
                site: new SiteSettings($cache['site']),
                brand: new BrandSettings($cache['brand'] ?? []),
                identity: new IdentitySettings($cache['identity']),
                authors: new AuthorsSettings($cache['authors']),
                postTypes: new PostTypeSettingsCollection($post_types),
                taxonomies: new TaxonomySettingsCollection($taxonomies),
                crawling: new CrawlingSettings($cache['crawling']),
                webhook: new WebhookSettings($cache['webhook']),
                uploads: new UploadsSettings($cache['uploads'] ?? []),
            );
        }

        $instance = static::load();
        $instance->cache();

        return $instance;
    }

    /**
     * Persist current settings state to transient cache.
     */
    public function cache(): void
    {
        SettingsCache::set([
            'site'       => $this->site->getData(),
            'brand'      => $this->brand->getData(),
            'identity' => [
                'type'         => $this->identity->getType(),
                'person'       => $this->identity->person->getData(),
                'organization' => $this->identity->organization->getData(),
            ],
            'authors'    => $this->authors->getData(),
            'post_types' => array_map(fn($s) => $s->getData(), $this->postTypes->all()),
            'taxonomies' => array_map(fn($s) => $s->getData(), $this->taxonomies->all()),
            'crawling'   => $this->crawling->getData(),
            'webhook'    => $this->webhook->getData(),
            'uploads'    => $this->uploads->getData(),
        ]);
    }

    /**
     * Invalidate the settings transient cache.
     */
    public static function invalidateCache(): void
    {
        SettingsCache::invalidate();
    }

    /**
     * Get the base URL of the site.
     * Uses configured site URL if set, otherwise falls back to WordPress home URL.
     *
     * @return string
     */
    public function getBaseUrl(): string
    {
        return untrailingslashit(
            $this->site->getUrl() ?? get_home_url()
        );
    }

    /**
     * Extracts the origin url from given absolute url.
     * 
     * @param string $url
     * 
     * @return string
     */
    public function getOrigin(string $url): string
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
    public function resolveUrl(string $base, string ...$parts): string
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
    public function resolvePostTemplate(string $template, WP_Post $post, array $extra = []): string
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
        ]), $this->site);
    }

    /**
     * Resolve a template string for a term using taxonomy-specific context variables.
     *
     * @param  string  $template
     * @param  WP_Term $term
     * @return string
     */
    public function resolveTermTemplate(string $template, WP_Term $term): string
    {
        return Variables::resolve($template, [
            'title'       => $term->name,
            'slug'        => $term->slug,
            'id'          => $term->term_id,
            'description' => $term->description ?: '',
        ], $this->site);
    }

    /**
     * Resolve a template string for an author using author-specific context variables.
     *
     * @param  string  $template
     * @param  WP_User $user
     * @return string
     */
    public function resolveAuthorTemplate(string $template, WP_User $user): string
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
        ], $this->site);
    }

    /**
     * Resolve the full archive URL for a given author.
     * Uses configured pathname structure if set, otherwise falls back to WordPress author URL
     * with the site origin replaced by the configured base URL origin.
     *
     * @param  WP_User $user
     * @return string
     */
    public function resolveAuthorUrl(WP_User $user): string
    {
        $authors = $this->authors;

        if ($authors->getPathnameStructure()) {
            $resolved_path = $this->resolveAuthorTemplate(
                $authors->getPathnameStructure(),
                $user
            );

            return $this->resolveUrl($this->getBaseUrl(), $resolved_path);
        }

        $wp_author_url = get_author_posts_url($user->ID);

        return $this->resolveUrl(
            $this->getBaseUrl(),
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
    public function resolvePostUrl(WP_Post $post, PostTypeSettings $post_type_settings): string
    {
        if ($post_type_settings->getPathnameStructure()) {
            $resolved_path = $this->resolvePostTemplate(
                $post_type_settings->getPathnameStructure(),
                $post
            );

            return $this->resolveUrl($this->getBaseUrl(), $resolved_path);
        }

        $wp_permalink = get_permalink($post);

        return $this->resolveUrl(
            $this->getBaseUrl(),
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
    public function resolveTermUrl(WP_Term $term, TaxonomySettings $taxonomy_settings): string
    {
        if ($taxonomy_settings->getPathnameStructure()) {
            $resolved_path = $this->resolveTermTemplate(
                $taxonomy_settings->getPathnameStructure(),
                $term
            );

            return $this->resolveUrl($this->getBaseUrl(), $resolved_path);
        }

        $wp_term_link = get_term_link($term);

        return $this->resolveUrl(
            $this->getBaseUrl(),
            str_replace($this->getOrigin($wp_term_link), '', $wp_term_link)
        );
    }
}
