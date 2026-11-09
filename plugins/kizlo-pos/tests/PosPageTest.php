<?php

namespace Kizlo\Pos\Tests;

use Kizlo\Modules\Extension\Extensions;
use Kizlo\Modules\Extension\Plugins;
use Kizlo\Modules\RestApi\RestGuard;
use Kizlo\Pos\Modules\Pos\PosPage;
use Kizlo\Pos\Plugin;
use Kizlo\Pos\Support\Asset;
use Kizlo\Pos\Support\Permissions;
use WP_REST_Request;
use WP_UnitTestCase;

final class PosPageTest extends WP_UnitTestCase
{
    private PosPage $page;

    protected function setUp(): void
    {
        parent::setUp();
        \WC_Install::create_roles();
        wp_roles()->init_roles();
        $this->page = new PosPage();
        $this->page->register();
        $this->set_permalink_structure('/%postname%/');
        PosPage::addRewrite();
        flush_rewrite_rules(false);
    }

    protected function tearDown(): void
    {
        wp_set_current_user(0);
        Plugins::reset();
        show_admin_bar(true);
        parent::tearDown();
    }

    public function test_both_staff_roles_can_enter_without_changing_admin_permissions(): void
    {
        foreach (['administrator', 'shop_manager'] as $role) {
            wp_set_current_user(self::factory()->user->create(['role' => $role]));
            $before = current_user_can('manage_options');
            $this->go_to(PosPage::url());
            $this->assertTrue(Permissions::access());
            $this->page->authorize();
            $this->assertSame(KIZLO_POS_PATH . 'src/php/Modules/Pos/views/app.php', $this->page->template('theme.php'));
            $this->assertFalse(is_admin_bar_showing());
            $this->assertSame($before, current_user_can('manage_options'));
            $this->assertSame($role === 'administrator', $before);
        }
    }

    public function test_anonymous_access_returns_through_the_normal_wordpress_login(): void
    {
        $this->go_to(PosPage::url());
        $this->assertSame(401, Permissions::access()->get_error_data()['status']);
        add_filter('wp_redirect', static function (string $url): string {
            throw new \RuntimeException($url);
        });
        try {
            $this->page->authorize();
            $this->fail('Anonymous access must redirect before rendering.');
        } catch (\RuntimeException $exception) {
            $this->assertSame(wp_login_url(PosPage::url()), $exception->getMessage());
        }
        $this->assertFalse(wp_script_is('kizlo-pos', 'enqueued'));
        $this->assertSame('theme.php', $this->page->template('theme.php'));
    }

    public function test_customers_and_subscribers_are_denied_before_assets_or_bootstrap(): void
    {
        foreach (['customer', 'subscriber'] as $role) {
            wp_set_current_user(self::factory()->user->create(['role' => $role]));
            $this->go_to(PosPage::url());
            $this->assertSame(403, Permissions::access()->get_error_data()['status']);
            Asset::enqueue();
            $this->assertFalse(wp_script_is('kizlo-pos', 'enqueued'));
            $this->assertSame('theme.php', $this->page->template('theme.php'));
            try {
                $this->page->authorize();
                $this->fail('Unsupported roles cannot render the app.');
            } catch (\WPDieException $exception) {
                $this->assertStringContainsString('permission', $exception->getMessage());
            }
        }
    }

    public function test_pos_headers_are_private_and_unrelated_pages_keep_their_theme(): void
    {
        $this->go_to(PosPage::url());
        $this->assertStringContainsString('no-store', $this->page->headers([])['Cache-Control']);
        $this->assertTrue($this->page->allowFrontend(false));
        $this->go_to(home_url('/'));
        $this->assertSame([], $this->page->headers([]));
        $this->assertFalse($this->page->allowFrontend(false));
        $this->assertSame('theme.php', $this->page->template('theme.php'));
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));
        Asset::enqueue();
        $this->assertFalse(wp_script_is('kizlo-pos', 'enqueued'));
        $this->page->authorize();
        $this->assertTrue(is_admin_bar_showing());
    }

    public function test_existing_content_is_never_replaced_even_after_activation(): void
    {
        $id = self::factory()->post->create(['post_type' => 'page', 'post_status' => 'publish', 'post_name' => 'pos', 'post_content' => 'Existing store content']);
        $this->assertSame($id, PosPage::collision()['page_id']);
        $query = $this->page->preserveCollision(['kizlo_pos' => '1']);
        $this->assertSame($id, $query['page_id']);
        $this->assertArrayNotHasKey('kizlo_pos', $query);
        $this->go_to(PosPage::url());
        $this->assertFalse(PosPage::isRequest());
        $this->assertSame($id, get_queried_object_id());
        $this->assertTrue(is_page($id));
        $this->assertFalse(is_single());
        $this->assertSame('theme.php', $this->page->template('theme.php'));
        $this->assertSame('Existing store content', get_post($id)->post_content);
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));
        ob_start();
        $this->page->setupNotice();
        $this->assertStringContainsString('Rename or move', (string) ob_get_clean());
    }

    public function test_product_slug_does_not_block_pos_but_a_page_at_the_same_url_does(): void
    {
        global $wp_rewrite;
        $original = $wp_rewrite->extra_permastructs;
        try {
            $wp_rewrite->add_permastruct('product', 'product/%product%', ['with_front' => false]);
            $product = self::factory()->post->create(['post_type' => 'product', 'post_status' => 'publish', 'post_name' => 'pos']);
            $this->assertSame(home_url('/product/pos/'), get_permalink($product));
            $this->assertNull(PosPage::collision());
            $this->go_to(PosPage::url());
            $this->assertTrue(PosPage::isRequest());
            $this->assertSame(['kizlo_pos' => '1'], $this->page->preserveCollision(['kizlo_pos' => '1']));

            $page = self::factory()->post->create(['post_type' => 'page', 'post_status' => 'publish', 'post_name' => 'pos']);
            $this->assertSame($page, PosPage::collision()['page_id']);
            $this->go_to(PosPage::url());
            $this->assertFalse(PosPage::isRequest());
            $this->assertSame($page, get_queried_object_id());
            $this->assertTrue(is_page($page));
            $this->assertFalse(is_single());
        } finally {
            $wp_rewrite->extra_permastructs = $original;
        }
    }

    public function test_existing_archive_and_explicit_rewrite_routes_are_preserved(): void
    {
        register_post_type('pos_fixture', ['public' => true, 'has_archive' => 'pos', 'rewrite' => ['slug' => 'inventory']]);
        try {
            $this->assertSame(['post_type' => 'pos_fixture'], PosPage::collision());
            $this->assertSame(['post_type' => 'pos_fixture'], $this->page->preserveCollision(['kizlo_pos' => '1']));
        } finally {
            unregister_post_type('pos_fixture');
        }
        global $wp_rewrite;
        $original = $wp_rewrite->extra_rules_top;
        try {
            $wp_rewrite->extra_rules_top['^pos/?$'] = 'index.php?existing_pos=1';
            $this->assertSame(['existing_pos' => '1'], PosPage::collision());
            PosPage::deactivate();
            $this->assertSame('index.php?existing_pos=1', $wp_rewrite->extra_rules_top['^pos/?$']);
        } finally {
            $wp_rewrite->extra_rules_top = $original;
        }
    }

    public function test_route_lifecycle_flushes_only_on_activation_or_version_change(): void
    {
        global $wp_rewrite;
        PosPage::activate();
        $this->assertSame('index.php?kizlo_pos=1', get_option('rewrite_rules')['^pos/?$']);
        $this->assertSame(KIZLO_POS_VERSION, get_option('kizlo_pos_rewrite_version'));
        update_option('rewrite_rules', ['sentinel' => 'unchanged']);
        PosPage::maybeFlush();
        $this->assertSame(['sentinel' => 'unchanged'], get_option('rewrite_rules'));
        update_option('kizlo_pos_rewrite_version', 'old');
        PosPage::maybeFlush();
        $this->assertArrayHasKey('^pos/?$', get_option('rewrite_rules'));
        PosPage::deactivate();
        $this->assertArrayNotHasKey('^pos/?$', get_option('rewrite_rules'));
        $this->assertArrayNotHasKey('^pos/?$', $wp_rewrite->extra_rules_top);
    }

    public function test_bootstrap_uses_current_site_urls_and_minimal_safe_identity(): void
    {
        update_option('home', 'https://example.org/store');
        update_option('siteurl', 'https://example.org/store/wp');
        $id = self::factory()->user->create(['role' => 'shop_manager', 'display_name' => '</script><script>alert("x")</script>']);
        wp_set_current_user($id);
        $data = Asset::bootstrap();
        $this->assertSame('https://example.org/store/pos/', $data['urls']['pos']);
        $this->assertSame(rest_url(), $data['restRoot']);
        wp_parse_str(wp_parse_url($data['urls']['logout'], PHP_URL_QUERY), $logout);
        $this->assertSame('logout', $logout['action']);
        $this->assertSame(PosPage::url(), $logout['redirect_to']);
        $this->assertNotFalse(wp_verify_nonce($logout['_wpnonce'], 'log-out'));
        $this->assertSame(['id', 'name'], array_keys($data['user']));
        $this->assertSame($id, $data['user']['id']);
        $this->assertNotFalse(wp_verify_nonce($data['nonce'], 'wp_rest'));
        $inline = Asset::inlineData($data);
        $this->assertStringNotContainsString('</script>', $inline);
        $this->assertStringNotContainsString('password', $inline);
        $this->assertStringNotContainsString('user_email', $inline);
        $this->assertSame($data, json_decode(substr($inline, strlen('window.kizloPos = '), -1), true));
    }

    public function test_bootstrap_decodes_wordpress_store_name_for_plain_text_clients(): void
    {
        $name = "Books & Co's Store";
        update_option('blogname', $name);
        $this->assertNotSame($name, get_option('blogname'));
        $this->assertSame($name, Asset::bootstrap()['store']['name']);
    }

    public function test_manifest_assets_are_scoped_to_pos_and_precede_the_module(): void
    {
        wp_set_current_user(self::factory()->user->create(['role' => 'shop_manager']));
        $this->go_to(PosPage::url());
        $this->assertTrue(Asset::available(), 'Build POS assets before running the suite.');
        Asset::enqueue();
        $asset = require KIZLO_POS_PATH . 'build/modules/pos/index.asset.php';
        $this->assertSame($asset['dependencies'], wp_scripts()->registered['kizlo-pos']->deps);
        $this->assertContains('wp-element', $asset['dependencies']);
        $this->assertContains('react', $asset['dependencies']);
        $before = implode('', wp_scripts()->get_data('kizlo-pos', 'before'));
        $this->assertStringContainsString('window.kizloPos = ', $before);
        $this->assertStringNotContainsString('window.kizlo = ', $before);
        $this->assertTrue(wp_style_is('kizlo-pos', 'enqueued'));
    }

    public function test_dependency_gate_blocks_missing_dependencies_and_starts_when_active(): void
    {
        foreach ([[], ['kizlo/kizlo.php'], ['woocommerce/woocommerce.php']] as $active) {
            update_option('active_plugins', $active);
            Plugins::reset();
            Extensions::reset();
            remove_action('template_redirect', [$this->page, 'authorize'], -1);
            Plugin::load();
            $this->assertNotEmpty(Extensions::blocked());
            $this->assertArrayNotHasKey('kizlo-pos', Extensions::booted());
        }
        update_option('active_plugins', ['kizlo/kizlo.php', 'woocommerce/woocommerce.php', 'kizlo-pos/kizlo-pos.php']);
        Plugins::reset();
        Extensions::reset();
        Plugin::load();
        $this->assertSame(KIZLO_POS_VERSION, Extensions::booted()['kizlo-pos']);
    }

    public function test_cookie_nonce_permissions_do_not_relax_the_core_or_headless_guards(): void
    {
        wp_set_current_user(self::factory()->user->create(['role' => 'shop_manager']));
        $this->assertTrue(Permissions::access());
        (new \Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceModule())->register();
        $guard = new RestGuard();
        $this->assertSame('kizlo_rest_unauthorized', $guard->requireAdmin(null, null, new WP_REST_Request('GET', '/wc/store/v1/cart'))->get_error_code());
        $this->assertFalse(RestGuard::protectsRoute(new WP_REST_Request('GET', '/kizlo-pos/v1/products')));
        $request = new WP_REST_Request('GET', '/kizlo/v1/settings');
        $response = rest_get_server()->dispatch($request);
        $this->assertSame(403, $response->get_status());
        $this->assertFalse(current_user_can('manage_options'));
    }
}
