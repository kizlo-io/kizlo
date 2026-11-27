<?php

namespace Kizlo\Tests\Appearance;

use Kizlo\Modules\Appearance\PublicMenus;
use Kizlo\Tests\TestCase;
use WP_REST_Request;
use WP_REST_Server;

final class PublicMenusTest extends TestCase
{
    public function test_anonymous_navigation_excludes_draft_targets_and_ignores_edit_context(): void
    {
        wp_set_current_user(0);
        $menu = wp_create_nav_menu('Public header');
        $published = self::factory()->post->create(['post_status' => 'publish', 'post_title' => 'Visible page']);
        $draft = self::factory()->post->create(['post_status' => 'draft', 'post_title' => 'Private draft label']);
        foreach ([$published, $draft] as $id) {
            wp_update_nav_menu_item($menu, 0, ['menu-item-type' => 'post_type', 'menu-item-object' => 'post',
                'menu-item-object-id' => $id, 'menu-item-status' => 'publish']);
        }
        (new PublicMenus())->register();
        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        do_action('rest_api_init', $wp_rest_server);
        $request = new WP_REST_Request('GET', '/kizlo/v1/menu-items');
        $request->set_query_params(['menus' => [$menu], 'context' => 'edit', 'status' => 'draft']);
        $response = rest_do_request($request);
        self::assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        self::assertSame([$published], array_column($response->get_data(), 'object_id'));
        self::assertStringNotContainsString('Private draft label', wp_json_encode($response->get_data()));
        self::assertArrayNotHasKey('raw', $response->get_data()[0]['title']);
    }
}
