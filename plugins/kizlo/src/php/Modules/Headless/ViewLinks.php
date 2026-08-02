<?php

namespace Kizlo\Modules\Headless;

use WP_Post;
use WP_REST_Response;
use Kizlo\Support\Utils;

/**
 * Points editor "View Post" / permalink affordances at the headless frontend.
 *
 * Two mechanisms cover every editor surface without touching public output:
 *  - The core permalink filters, scoped to admin requests, feed the classic
 *    list-table "View" action, the editor permalink, and the admin-bar link.
 *  - A `rest_prepare_*` filter overrides the `link` field that Gutenberg's
 *    "View Post" uses.
 * Public `get_permalink()` calls (canonical redirects, sitemaps, the theme) keep
 * their native URLs; frontend routing is handled by the lockout behaviour.
 * Sample/editable permalinks are left native so the slug editor keeps working.
 */
class ViewLinks
{
    private bool $resolving = false;

    public function register(): void
    {
        add_filter('post_link', [$this, 'filterPostLink'], PHP_INT_MAX, 3);
        add_filter('post_type_link', [$this, 'filterPostTypeLink'], PHP_INT_MAX, 4);
        add_filter('page_link', [$this, 'filterPageLink'], PHP_INT_MAX, 3);

        // The editor also shows the permalink as visible text; swap the WordPress
        // origin for the frontend so the displayed URL matches where "View" points.
        add_filter('get_sample_permalink_html', [$this, 'filterSamplePermalinkHtml'], PHP_INT_MAX);

        add_action('rest_api_init', [$this, 'registerRestLinkOverride']);
    }

    public function filterPostLink(string $url, WP_Post $post, bool $leavename): string
    {
        if ($leavename || ! is_admin()) {
            return $url;
        }

        return $this->resolve($post) ?? $url;
    }

    public function filterPostTypeLink(string $url, WP_Post $post, bool $leavename, bool $sample): string
    {
        if ($leavename || $sample || ! is_admin()) {
            return $url;
        }

        return $this->resolve($post) ?? $url;
    }

    public function filterPageLink(string $url, int $post_id, bool $sample): string
    {
        if ($sample || ! is_admin()) {
            return $url;
        }

        $post = get_post($post_id);

        return $post instanceof WP_Post ? ($this->resolve($post) ?? $url) : $url;
    }

    /**
     * Override the REST `link` field for every REST-exposed post type so the
     * block editor's "View Post" opens the headless frontend.
     */
    public function registerRestLinkOverride(): void
    {
        foreach (get_post_types(['show_in_rest' => true]) as $post_type) {
            add_filter("rest_prepare_{$post_type}", [$this, 'filterRestLink'], PHP_INT_MAX, 2);
        }
    }

    public function filterRestLink(WP_REST_Response $response, WP_Post $post): WP_REST_Response
    {
        $url = $this->resolve($post);

        if ($url === null) {
            return $response;
        }

        $data = $response->get_data();
        $data['link'] = $url;

        // The block editor builds the displayed permalink from `permalink_template`
        // (edit context), not `link`; swap its origin so the shown URL is the
        // frontend too, keeping the %postname% placeholder for the slug editor.
        if (isset($data['permalink_template']) && is_string($data['permalink_template'])) {
            $data['permalink_template'] = $this->toFrontend($data['permalink_template']);
        }

        $response->set_data($data);

        return $response;
    }

    /**
     * Rewrite the classic editor's permalink display (both the anchor and the
     * visible URL text) to the frontend origin, leaving the editable slug markup
     * intact.
     */
    public function filterSamplePermalinkHtml(string $html): string
    {
        return $this->toFrontend($html);
    }

    /**
     * Swap the WordPress origin for the configured frontend base in a URL (or in a
     * blob of HTML containing one), preserving any path or placeholder that follows.
     */
    private function toFrontend(string $value): string
    {
        $settings = Utils::getSettings();
        $origin = $settings->getOrigin(home_url('/'));

        return str_replace($origin, $settings->getBaseUrl(), $value);
    }

    /**
     * Resolve a post's headless frontend URL, or null when it cannot be mapped.
     * The reentrancy guard keeps the nested get_permalink() call (used by
     * resolvePostUrl) from looping back through the permalink filters.
     */
    private function resolve(WP_Post $post): ?string
    {
        if ($this->resolving) {
            return null;
        }

        $settings = Utils::getSettings();
        $post_type_settings = $settings->postTypes->get($post->post_type);

        $this->resolving = true;

        try {
            return untrailingslashit($settings->resolvePostUrl($post, $post_type_settings));
        } finally {
            $this->resolving = false;
        }
    }
}
