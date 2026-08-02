<?php

namespace Kizlo\Tests\Headless;

/**
 * HeadlessModule behaviour: each toggle wires the WordPress surface it promises,
 * and nothing wires while the master switch is off.
 */
class HeadlessModuleTest extends HeadlessTestCase
{
    public function test_master_off_leaves_wordpress_native(): void
    {
        update_option('blog_public', '1');

        $this->bootHeadless([
            'enabled'        => false,
            'block_indexing' => true,
            'disable_xmlrpc' => true,
        ]);

        $this->assertSame('1', get_option('blog_public'));
        $this->assertTrue(apply_filters('xmlrpc_enabled', true));
    }

    public function test_block_indexing_forces_blog_public_off(): void
    {
        update_option('blog_public', '1');

        $this->bootHeadless(['enabled' => true, 'block_indexing' => true]);

        $this->assertSame('0', get_option('blog_public'));
    }

    public function test_block_indexing_off_leaves_blog_public_untouched(): void
    {
        update_option('blog_public', '1');

        $this->bootHeadless(['enabled' => true, 'block_indexing' => false]);

        $this->assertSame('1', get_option('blog_public'));
    }

    public function test_disable_xmlrpc_disables_the_endpoint(): void
    {
        $this->bootHeadless(['enabled' => true, 'disable_xmlrpc' => true]);

        $this->assertFalse(apply_filters('xmlrpc_enabled', true));
    }

    public function test_disable_feeds_replaces_feed_handlers_and_strips_links(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'disable_feeds' => true]);

        $this->assertSame(1, has_action('do_feed_rss2', [$module, 'disableFeed']));
        $this->assertFalse(has_action('wp_head', 'feed_links'));
        $this->assertFalse(has_action('wp_head', 'feed_links_extra'));
    }

    public function test_disable_embeds_removes_oembed_surface(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'disable_embeds' => true]);

        // register() defers the removal to init, which has already fired in tests.
        $module->disableEmbeds();

        $this->assertFalse(has_action('wp_head', 'wp_oembed_add_discovery_links'));
        $this->assertFalse(has_action('wp_head', 'wp_oembed_add_host_js'));
        $this->assertFalse(apply_filters('embed_oembed_discover', true));
    }

    public function test_clean_head_strips_generator_and_meta_links(): void
    {
        $this->bootHeadless(['enabled' => true, 'clean_head' => true]);

        $this->assertFalse(has_action('wp_head', 'wp_generator'));
        $this->assertFalse(has_action('wp_head', 'rsd_link'));
        $this->assertFalse(has_action('wp_head', 'wlwmanifest_link'));
        $this->assertFalse(has_action('wp_head', 'wp_shortlink_wp_head'));
        $this->assertSame('', apply_filters('the_generator', 'WordPress 6.4'));
    }

    public function test_disable_pingbacks_closes_pings_and_strips_header(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'disable_pingbacks' => true]);

        $this->assertFalse(apply_filters('pings_open', true, 0));

        $headers = $module->removeXPingbackHeader(['X-Pingback' => 'https://example.com/xmlrpc.php', 'Keep' => '1']);
        $this->assertArrayNotHasKey('X-Pingback', $headers);
        $this->assertArrayHasKey('Keep', $headers);

        $methods = $module->removePingbackMethods(['pingback.ping' => 'cb', 'demo.sayHello' => 'cb']);
        $this->assertArrayNotHasKey('pingback.ping', $methods);
        $this->assertArrayHasKey('demo.sayHello', $methods);
    }

    public function test_block_enumeration_wires_guards_and_strips_users_route_for_guests(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'block_enumeration' => true]);

        $this->assertSame(0, has_action('template_redirect', [$module, 'blockAuthorEnumeration']));
        $this->assertNotFalse(has_filter('rest_endpoints', [$module, 'removeUsersRestForGuests']));

        $endpoints = ['/wp/v2/users' => [], '/wp/v2/users/(?P<id>[\d]+)' => [], '/wp/v2/posts' => []];
        $guarded = $module->removeUsersRestForGuests($endpoints);

        $this->assertArrayNotHasKey('/wp/v2/users', $guarded);
        $this->assertArrayNotHasKey('/wp/v2/users/(?P<id>[\d]+)', $guarded);
        $this->assertArrayHasKey('/wp/v2/posts', $guarded);
    }

    public function test_users_route_is_kept_for_privileged_users(): void
    {
        $admin = self::factory()->user->create(['role' => 'administrator']);
        wp_set_current_user($admin);

        $module = $this->bootHeadless(['enabled' => true, 'block_enumeration' => true]);

        $endpoints = ['/wp/v2/users' => [], '/wp/v2/posts' => []];

        $this->assertSame($endpoints, $module->removeUsersRestForGuests($endpoints));
    }

    public function test_frontend_lockout_locks_a_real_public_request(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'frontend_lockout' => true]);

        $post = self::factory()->post->create_and_get(['post_status' => 'publish']);
        $this->go_to(get_permalink($post));
        $this->assertTrue(is_singular(), 'The real post should resolve before lockout runs.');

        // The request would be terminated with a bare 404 (the exit itself can't run
        // under phpunit); the lock decision is what matters and is asserted here.
        $this->assertTrue($module->isLockedRequest());
    }

    public function test_frontend_lockout_exempts_feeds(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'frontend_lockout' => true]);

        global $wp_query;
        $wp_query->is_feed = true;

        $this->assertFalse($module->isLockedRequest());
    }

    public function test_frontend_lockout_exempts_robots(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'frontend_lockout' => true]);

        global $wp_query;
        $wp_query->is_robots = true;

        $this->assertFalse($module->isLockedRequest());
    }

    public function test_frontend_lockout_locks_the_wordpress_sitemap(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'frontend_lockout' => true]);

        // /wp-sitemap.xml resolves to the core sitemap query var. It lists origin
        // URLs the lockout blocks, so the request must be locked too.
        set_query_var('sitemap', 'index');

        $this->assertTrue($module->isLockedRequest());
    }

    public function test_redirect_mode_maps_a_request_to_the_frontend_path(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'frontend_lockout' => true, 'frontend_lockout_redirect' => true]);

        $_SERVER['REQUEST_URI'] = '/blog/';
        $this->assertSame(self::BASE_URL . '/blog/', $module->resolveFrontendUrl());
    }

    public function test_redirect_mode_uses_the_resolved_post_url_for_singular(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'frontend_lockout' => true, 'frontend_lockout_redirect' => true]);

        $post = self::factory()->post->create_and_get(['post_type' => 'post', 'post_status' => 'publish', 'post_name' => 'hello-world']);
        $this->go_to(get_permalink($post));

        $target = $module->resolveFrontendUrl();

        $this->assertNotNull($target);
        $this->assertStringStartsWith(self::BASE_URL, $target);
        $this->assertStringContainsString('hello-world', $target);
    }

    public function test_redirect_mode_falls_back_to_null_without_a_frontend_url(): void
    {
        $module = $this->bootHeadless(['enabled' => true, 'frontend_lockout' => true, 'frontend_lockout_redirect' => true], ['url' => null]);

        $this->assertNull($module->resolveFrontendUrl());
    }
}
