<?php

namespace Kizlo\Modules\Headless;

/**
 * Moves the login screen to a secret slug and hides `wp-login.php`.
 *
 * Bots hammering the default login path get a bare 404; the real login form is
 * served only at the configured slug. Every login-related URL WordPress builds is
 * rewritten to the slug, so logout and password-reset keep working for a logged-in
 * admin. A logged-out visitor reaching `/wp-admin` is 404'd rather than redirected
 * to the login screen, so the auth redirect can never hand out the secret slug.
 *
 * Runs on `wp_loaded`, the end of bootstrap: `init` has fired (so functionality
 * constants like AUTOSAVE_INTERVAL exist), yet the front-end query and template
 * have not, so serving `wp-login.php` here is safe. It also fires during a direct
 * `wp-login.php` request (that file loads WordPress too), so hiding still applies.
 */
class LoginProtection
{
    private string $slug;

    public function __construct(string $slug)
    {
        $this->slug = $slug;
    }

    public function register(): void
    {
        add_action('wp_loaded', [$this, 'handleRequest'], 1);

        foreach (['site_url', 'network_site_url', 'wp_redirect', 'login_url', 'logout_url', 'lostpassword_url', 'register_url'] as $filter) {
            add_filter($filter, [$this, 'filterUrl'], 10, 1);
        }
    }

    /**
     * Swap the `wp-login.php` segment for the secret slug in any WordPress-built
     * URL, so nothing hands out the default login path.
     *
     * @param  mixed $url
     * @return mixed
     */
    public function filterUrl(mixed $url): mixed
    {
        if (! is_string($url) || strpos($url, 'wp-login.php') === false) {
            return $url;
        }

        return str_replace('wp-login.php', $this->slug, $url);
    }

    public function handleRequest(): void
    {
        $action = $this->resolve($this->currentPath(), (string) ($GLOBALS['pagenow'] ?? ''), is_user_logged_in());

        if ($action === 'login') {
            $this->serveLogin();
        } elseif ($action === 'hide') {
            $this->notFound();
        }
    }

    /**
     * Decide how to handle the current request path.
     *
     * `$isLoggedIn` gates the admin guard only: a logged-out visitor reaching
     * `/wp-admin` is hidden so the auth redirect never leaks the secret slug, while
     * a logged-in user passes straight through to the admin they can already reach.
     *
     * @return 'login'|'hide'|'pass' `login` serves the form at the secret slug,
     *         `hide` 404s the default `wp-login.php` or a logged-out admin request,
     *         `pass` leaves it untouched.
     */
    public function resolve(string $path, string $pagenow, bool $isLoggedIn = true): string
    {
        $path = untrailingslashit($path);

        if ($path !== '' && $path === $this->loginPath()) {
            return 'login';
        }

        if ($pagenow === 'wp-login.php' || $path === $this->defaultLoginPath()) {
            return 'hide';
        }

        // A logged-out hit on wp-admin would be redirected to the login screen, and
        // the redirect/login URL filters would rewrite that to the secret slug,
        // exposing it. 404 the admin instead. admin-ajax.php and admin-post.php live
        // under wp-admin but serve logged-out requests by design, so they pass.
        if (! $isLoggedIn && $this->isAdminPath($path) && ! in_array($pagenow, ['admin-ajax.php', 'admin-post.php'], true)) {
            return 'hide';
        }

        return 'pass';
    }

    /** The secret slug path, relative to the WordPress home path. */
    private function loginPath(): string
    {
        return $this->homePath() . '/' . $this->slug;
    }

    /** The default `wp-login.php` path, relative to the WordPress home path. */
    private function defaultLoginPath(): string
    {
        return $this->homePath() . '/wp-login.php';
    }

    /** Whether the path targets the wp-admin area (the directory or anything under it). */
    private function isAdminPath(string $path): bool
    {
        $admin = $this->adminPath();

        return $admin !== '' && ($path === $admin || str_starts_with($path, $admin . '/'));
    }

    /** The wp-admin path, relative to the WordPress site path. */
    private function adminPath(): string
    {
        $path = wp_parse_url(admin_url(), PHP_URL_PATH);

        return untrailingslashit(is_string($path) ? $path : '');
    }

    private function homePath(): string
    {
        $path = wp_parse_url(home_url(), PHP_URL_PATH);

        return untrailingslashit(is_string($path) ? $path : '');
    }

    private function currentPath(): string
    {
        $path = wp_parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

        return untrailingslashit(is_string($path) ? $path : '');
    }

    private function serveLogin(): void
    {
        global $pagenow;
        $pagenow = 'wp-login.php';

        require_once ABSPATH . 'wp-login.php';
        exit;
    }

    private function notFound(): void
    {
        status_header(404);
        nocache_headers();
        exit;
    }
}
