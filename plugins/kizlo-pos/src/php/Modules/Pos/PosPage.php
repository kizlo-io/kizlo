<?php

namespace Kizlo\Pos\Modules\Pos;

use Kizlo\Pos\Support\Asset;
use Kizlo\Pos\Support\Permissions;

final class PosPage
{
    private const RULE = '^pos/?$';

    public function register(): void
    {
        add_action('init', [self::class, 'addRewrite'], 20);
        add_action('wp_loaded', [self::class, 'maybeFlush']);
        add_filter('query_vars', [$this, 'queryVars']);
        add_filter('request', [$this, 'preserveCollision']);
        add_filter('wp_headers', [$this, 'headers']);
        add_filter('kizlo_headless_render_frontend', [$this, 'allowFrontend']);
        add_action('template_redirect', [$this, 'authorize'], -1);
        add_filter('template_include', [$this, 'template'], PHP_INT_MAX);
        add_action('admin_notices', [$this, 'setupNotice']);
    }

    public static function url(): string
    {
        return home_url('/pos/');
    }

    public static function isRequest(): bool
    {
        global $wp;
        return isset($wp->request) && trim($wp->request, '/') === 'pos' && self::collision() === null;
    }

    /** @return array<string, mixed>|null */
    public static function collision(): ?array
    {
        foreach (get_post_types(['public' => true], 'objects') as $type) {
            $post = get_page_by_path('pos', OBJECT, [$type->name]);
            if ($post !== null) {
                $url = get_permalink($post);
                if ($url && untrailingslashit($url) === untrailingslashit(self::url())) {
                    return $post->post_type === 'page'
                        ? ['page_id' => $post->ID]
                        : ['p' => $post->ID, 'post_type' => $post->post_type];
                }
            }

            $archive = get_post_type_archive_link($type->name);
            if ($archive && untrailingslashit($archive) === untrailingslashit(self::url())) {
                return ['post_type' => $type->name];
            }
        }

        global $wp_rewrite;
        $rules = $wp_rewrite->extra_rules_top + $wp_rewrite->extra_rules + (array) get_option('rewrite_rules', []);
        foreach ($rules as $pattern => $query) {
            // Only explicit /pos rules claim this address; generic page catch-alls do not.
            if ($query === 'index.php?kizlo_pos=1' || !str_starts_with(ltrim($pattern, '^'), 'pos')) continue;
            if (preg_match('#' . str_replace('#', '\\#', $pattern) . '#', 'pos/', $matches) !== 1) continue;
            $query = \WP_MatchesMapRegex::apply($query, $matches);
            wp_parse_str((string) wp_parse_url($query, PHP_URL_QUERY), $vars);
            return $vars;
        }

        return null;
    }

    public static function addRewrite(): void
    {
        if (self::collision() === null) add_rewrite_rule(self::RULE, 'index.php?kizlo_pos=1', 'top');
    }

    public static function activate(): void
    {
        self::addRewrite();
        flush_rewrite_rules(false);
        update_option('kizlo_pos_rewrite_version', KIZLO_POS_VERSION, false);
    }

    public static function deactivate(): void
    {
        global $wp_rewrite;
        if (($wp_rewrite->extra_rules_top[self::RULE] ?? null) === 'index.php?kizlo_pos=1') {
            unset($wp_rewrite->extra_rules_top[self::RULE]);
        }
        flush_rewrite_rules(false);
        delete_option('kizlo_pos_rewrite_version');
    }

    public static function maybeFlush(): void
    {
        if (get_option('kizlo_pos_rewrite_version') !== KIZLO_POS_VERSION) self::activate();
    }

    /** @param string[] $vars @return string[] */
    public function queryVars(array $vars): array
    {
        $vars[] = 'kizlo_pos';
        return $vars;
    }

    /** @param array<string, mixed> $query @return array<string, mixed> */
    public function preserveCollision(array $query): array
    {
        // A page can be created after activation, while the old POS rewrite is still stored.
        if (!empty($query['kizlo_pos']) && ($collision = self::collision()) !== null) {
            unset($query['kizlo_pos']);
            $query = $collision + $query;
        }
        return $query;
    }

    /** @param array<string, string> $headers @return array<string, string> */
    public function headers(array $headers): array
    {
        if (self::isRequest()) {
            $headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0, private';
            $headers['X-Robots-Tag'] = 'noindex, nofollow';
        }
        return $headers;
    }

    public function allowFrontend(bool $allowed): bool
    {
        return $allowed || self::isRequest();
    }

    public function authorize(): void
    {
        if (!self::isRequest()) return;

        nocache_headers();
        if (!headers_sent()) header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
        $access = Permissions::access();
        if (is_wp_error($access)) {
            if ($access->get_error_code() === 'kizlo_pos_login_required') {
                wp_safe_redirect(wp_login_url(self::url()));
                exit;
            }
            wp_die(esc_html($access->get_error_message()), 'Kizlo POS', ['response' => 403]);
        }

        if (!Asset::available()) {
            wp_die('Kizlo POS assets are missing. Install a built plugin ZIP or run the POS build command.', 'Kizlo POS', ['response' => 503]);
        }

        show_admin_bar(false);
        remove_action('template_redirect', 'redirect_canonical');
        status_header(200);
    }

    public function template(string $template): string
    {
        return self::isRequest() && Permissions::access() === true
            ? KIZLO_POS_PATH . 'src/php/Modules/Pos/views/app.php'
            : $template;
    }

    public function setupNotice(): void
    {
        if (!current_user_can('activate_plugins') || self::collision() === null) return;

        echo '<div class="notice notice-error"><p>' . esc_html(
            'Kizlo POS cannot use /pos/: existing content already owns this address. Rename or move that content before opening POS. It has not been replaced.'
        ) . '</p></div>';
    }
}
