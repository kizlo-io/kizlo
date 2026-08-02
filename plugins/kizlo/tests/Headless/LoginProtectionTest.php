<?php

namespace Kizlo\Tests\Headless;

use Kizlo\Tests\TestCase;
use Kizlo\Modules\Headless\LoginProtection;

/**
 * LoginProtection routing: the secret slug serves the form, the default
 * wp-login.php is hidden, and every other request passes through untouched. URL
 * rewriting swaps wp-login.php for the slug so nothing hands out the real path.
 */
class LoginProtectionTest extends TestCase
{
    private function protection(string $slug = 'secret'): LoginProtection
    {
        return new LoginProtection($slug);
    }

    public function test_secret_slug_serves_the_login(): void
    {
        $this->assertSame('login', $this->protection()->resolve('/secret', 'index.php'));
        // Trailing slash is ignored.
        $this->assertSame('login', $this->protection()->resolve('/secret/', 'index.php'));
    }

    public function test_default_login_is_hidden(): void
    {
        $this->assertSame('hide', $this->protection()->resolve('/wp-login.php', 'wp-login.php'));
        // Even if $pagenow is not set, the path alone hides it.
        $this->assertSame('hide', $this->protection()->resolve('/wp-login.php', ''));
    }

    public function test_other_requests_pass_through(): void
    {
        $this->assertSame('pass', $this->protection()->resolve('/about', 'index.php'));
        $this->assertSame('pass', $this->protection()->resolve('/', 'index.php'));
    }

    public function test_logged_in_user_reaches_wp_admin(): void
    {
        $this->assertSame('pass', $this->protection()->resolve('/wp-admin', 'index.php', true));
        $this->assertSame('pass', $this->protection()->resolve('/wp-admin/edit.php', 'edit.php', true));
    }

    public function test_logged_out_wp_admin_is_hidden(): void
    {
        // Reaching wp-admin logged out would redirect to login and leak the slug, so
        // the admin area is 404'd for guests instead.
        $this->assertSame('hide', $this->protection()->resolve('/wp-admin', 'index.php', false));
        $this->assertSame('hide', $this->protection()->resolve('/wp-admin/', 'index.php', false));
        $this->assertSame('hide', $this->protection()->resolve('/wp-admin/edit.php', 'edit.php', false));
    }

    public function test_logged_out_admin_ajax_and_post_still_pass(): void
    {
        // These endpoints serve logged-out requests by design and must stay reachable.
        $this->assertSame('pass', $this->protection()->resolve('/wp-admin/admin-ajax.php', 'admin-ajax.php', false));
        $this->assertSame('pass', $this->protection()->resolve('/wp-admin/admin-post.php', 'admin-post.php', false));
    }

    public function test_filter_url_swaps_wp_login_for_the_slug(): void
    {
        $protection = $this->protection();

        $this->assertSame(
            home_url('/secret?action=logout'),
            $protection->filterUrl(home_url('/wp-login.php?action=logout')),
        );

        // Unrelated URLs and non-strings are left untouched.
        $this->assertSame(home_url('/about'), $protection->filterUrl(home_url('/about')));
        $this->assertSame(false, $protection->filterUrl(false));
    }
}
