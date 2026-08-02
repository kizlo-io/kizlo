<?php

namespace Kizlo\Modules\Headless;

use WP_Post;
use Kizlo\Support\Utils;
use Kizlo\Modules\Settings\Headless\HeadlessSettings;

/**
 * Wires the Headless Mode behaviours onto WordPress.
 *
 * Every surface is gated on {@see HeadlessSettings::isEnabled()}, so when the
 * master switch is off nothing here registers and WordPress behaves natively.
 * Preview hijacking and view-post link rewriting live in their own modules; this
 * covers routing, feeds/embeds, search-engine control, and security hardening.
 */
class HeadlessModule
{
    private HeadlessSettings $headless;

    public function register(): void
    {
        $this->headless = Utils::getSettings()->headless;

        if (! $this->headless->isMasterEnabled()) {
            return;
        }

        $this->registerSearchEngineControl();
        $this->registerRouting();
        $this->registerFeedsAndEmbeds();
        $this->registerSecurityHardening();
    }

    // ============================================
    // SEARCH ENGINE CONTROL
    // ============================================

    private function registerSearchEngineControl(): void
    {
        if (! $this->headless->isEnabled('block_indexing')) {
            return;
        }

        // Kizlo owns blog_public: shadow every read so nothing in WordPress sees a
        // value other than the one this toggle dictates, whatever the stored row
        // says. The native checkbox is locked in Reading settings, and the PUT
        // handler writes the row so it stays consistent when the toggle flips off.
        add_filter('pre_option_blog_public', [$this, 'forceBlogPublic']);

        add_action('send_headers', [$this, 'sendNoindexHeader']);
        add_filter('rest_pre_serve_request', [$this, 'sendNoindexHeaderRest']);

        add_action('admin_footer-options-reading.php', [$this, 'lockReadingSetting']);
    }

    /**
     * Force blog_public to Kizlo's value. Returns '0' (discourage) while block
     * indexing is on so the WordPress origin is never indexable.
     */
    public function forceBlogPublic(): string
    {
        return '0';
    }

    public function sendNoindexHeader(): void
    {
        if (! headers_sent()) {
            header('X-Robots-Tag: noindex, nofollow', true);
        }
    }

    /**
     * @param  mixed $served
     * @return mixed
     */
    public function sendNoindexHeaderRest(mixed $served): mixed
    {
        if (! headers_sent()) {
            header('X-Robots-Tag: noindex, nofollow', true);
        }

        return $served;
    }

    /**
     * Lock the native "Discourage search engines" checkbox so the option can
     * only be changed through Kizlo.
     */
    public function lockReadingSetting(): void
    {
        ?>
        <script>
            (function () {
                var checkbox = document.getElementById('blog_public');
                if (!checkbox) return;

                checkbox.disabled = true;

                var row = checkbox.closest('td') || checkbox.parentNode;
                if (row && !row.querySelector('.kizlo-managed-note')) {
                    var note = document.createElement('p');
                    note.className = 'description kizlo-managed-note';
                    note.textContent = 'Managed by Kizlo Headless Mode.';
                    row.appendChild(note);
                }
            })();
        </script>
        <?php
    }

    // ============================================
    // DISPLAY & ROUTING
    // ============================================

    private function registerRouting(): void
    {
        if ($this->headless->isEnabled('view_links')) {
            (new ViewLinks())->register();
        }

        if ($this->headless->isEnabled('frontend_lockout')) {
            add_action('template_redirect', [$this, 'frontendLockout'], 0);
        }
    }

    /**
     * Lock public theme requests. By default a bare 404 is sent before the theme
     * loads (`template_redirect` fires ahead of `template_include`), so nothing
     * renders and the URL looks like any missing page. When the redirect mode is
     * on and a frontend URL is configured, the request is instead 301'd to the
     * matching page on the headless frontend.
     */
    public function frontendLockout(): void
    {
        if (! $this->isLockedRequest()) {
            return;
        }

        $target = $this->headless->isEnabled('frontend_lockout_redirect')
            ? $this->resolveFrontendUrl()
            : null;

        if ($target !== null) {
            wp_redirect($target, 301);
            exit;
        }

        status_header(404);
        nocache_headers();
        exit;
    }

    /**
     * The headless URL a redirected lockout request maps to: the resolved frontend
     * URL for singular content, otherwise the same path on the frontend base.
     * Null when no frontend URL is configured (the caller then serves a 404).
     */
    public function resolveFrontendUrl(): ?string
    {
        $settings = Utils::getSettings();

        if (empty($settings->site->getUrl())) {
            return null;
        }

        if (is_singular()) {
            $post = get_queried_object();
            if ($post instanceof WP_Post) {
                return $settings->resolvePostUrl($post, $settings->postTypes->get($post->post_type));
            }
        }

        $request_uri = $_SERVER['REQUEST_URI'] ?? '/';

        return untrailingslashit($settings->getBaseUrl()) . $request_uri;
    }

    /**
     * Whether this front-end request should be locked out. Feeds, robots.txt, and
     * favicons are exempt so their own behaviours (or WordPress) can answer and the
     * frontend can still reference them. The WordPress core sitemap is not exempt:
     * it only lists origin URLs the lockout blocks, so it is locked out too and the
     * headless frontend serves its own sitemap instead.
     */
    public function isLockedRequest(): bool
    {
        if (is_feed() || is_robots() || (function_exists('is_favicon') && is_favicon())) {
            return false;
        }

        return true;
    }

    // ============================================
    // FEEDS & EMBEDS
    // ============================================

    private function registerFeedsAndEmbeds(): void
    {
        if ($this->headless->isEnabled('disable_feeds')) {
            $feeds = ['do_feed', 'do_feed_rdf', 'do_feed_rss', 'do_feed_rss2', 'do_feed_atom', 'do_feed_rss2_comments', 'do_feed_atom_comments'];
            foreach ($feeds as $feed) {
                add_action($feed, [$this, 'disableFeed'], 1);
            }

            remove_action('wp_head', 'feed_links', 2);
            remove_action('wp_head', 'feed_links_extra', 3);
        }

        if ($this->headless->isEnabled('disable_embeds')) {
            add_action('init', [$this, 'disableEmbeds'], PHP_INT_MAX);
        }
    }

    public function disableFeed(): void
    {
        status_header(404);
        nocache_headers();
        wp_die('Feeds are disabled for this site.', 'Feeds disabled', ['response' => 404]);
    }

    /**
     * Remove the oEmbed provider surface and the `/embed` frontend endpoint.
     */
    public function disableEmbeds(): void
    {
        remove_action('rest_api_init', 'wp_oembed_register_route');
        remove_filter('oembed_dataparse', 'wp_filter_oembed_result', 10);
        // Core registers the discovery links twice: the real one at priority 4 and a
        // self-unhooking back-compat shim at the default priority 10. Remove both, or
        // the priority-4 copy still prints.
        remove_action('wp_head', 'wp_oembed_add_discovery_links', 4);
        remove_action('wp_head', 'wp_oembed_add_discovery_links');
        remove_action('wp_head', 'wp_oembed_add_host_js');

        add_filter('embed_oembed_discover', '__return_false');
        add_filter('tiny_mce_plugins', fn(array $plugins) => array_diff($plugins, ['wpembed']));
        add_filter('rewrite_rules_array', [$this, 'removeEmbedRewriteRules']);
    }

    /**
     * @param  array<string, string> $rules
     * @return array<string, string>
     */
    public function removeEmbedRewriteRules(array $rules): array
    {
        foreach ($rules as $rule => $rewrite) {
            if (str_contains($rewrite, 'embed=true')) {
                unset($rules[$rule]);
            }
        }

        return $rules;
    }

    // ============================================
    // SECURITY HARDENING
    // ============================================

    private function registerSecurityHardening(): void
    {
        if ($this->headless->isEnabled('disable_xmlrpc')) {
            add_filter('xmlrpc_enabled', '__return_false');
            add_filter('wp_headers', [$this, 'removeXPingbackHeader']);
        }

        if ($this->headless->isEnabled('block_enumeration')) {
            add_action('template_redirect', [$this, 'blockAuthorEnumeration'], 0);
            add_filter('rest_endpoints', [$this, 'removeUsersRestForGuests']);
        }

        if ($this->headless->isEnabled('clean_head')) {
            $this->cleanHead();
        }

        if ($this->headless->isEnabled('disable_file_editor')) {
            if (! defined('DISALLOW_FILE_EDIT')) {
                define('DISALLOW_FILE_EDIT', true);
            }
        }

        if ($this->headless->isEnabled('disable_pingbacks')) {
            add_filter('xmlrpc_methods', [$this, 'removePingbackMethods']);
            add_filter('wp_headers', [$this, 'removeXPingbackHeader']);
            add_filter('pings_open', '__return_false');
            add_filter('pre_option_default_ping_status', fn() => 'closed');
            add_filter('pre_option_default_pingback_flag', fn() => '');
        }

        if ($this->headless->isLoginRenameActive()) {
            $slug = $this->headless->getLoginSlug();
            if ($slug !== null) {
                (new LoginProtection($slug))->register();
            }
        }
    }

    /**
     * 404 author archives and `?author=N` probes for visitors who cannot edit
     * posts, closing the classic username-enumeration leak.
     */
    public function blockAuthorEnumeration(): void
    {
        if (is_admin() || current_user_can('edit_posts')) {
            return;
        }

        $has_author_query = isset($_GET['author']) || is_author();

        if ($has_author_query) {
            global $wp_query;
            $wp_query->set_404();
            status_header(404);
            nocache_headers();
        }
    }

    /**
     * @param  array<string, mixed> $endpoints
     * @return array<string, mixed>
     */
    public function removeUsersRestForGuests(array $endpoints): array
    {
        if (current_user_can('list_users')) {
            return $endpoints;
        }

        unset($endpoints['/wp/v2/users'], $endpoints['/wp/v2/users/(?P<id>[\d]+)']);

        return $endpoints;
    }

    private function cleanHead(): void
    {
        remove_action('wp_head', 'wp_generator');
        remove_action('wp_head', 'rsd_link');
        remove_action('wp_head', 'wlwmanifest_link');
        remove_action('wp_head', 'wp_shortlink_wp_head');
        remove_action('template_redirect', 'wp_shortlink_header', 11);

        add_filter('the_generator', '__return_empty_string');
    }

    /**
     * @param  array<string, string> $headers
     * @return array<string, string>
     */
    public function removeXPingbackHeader(array $headers): array
    {
        unset($headers['X-Pingback']);

        return $headers;
    }

    /**
     * @param  array<string, string> $methods
     * @return array<string, string>
     */
    public function removePingbackMethods(array $methods): array
    {
        unset($methods['pingback.ping'], $methods['pingback.extensions.getPingbacks']);

        return $methods;
    }
}
