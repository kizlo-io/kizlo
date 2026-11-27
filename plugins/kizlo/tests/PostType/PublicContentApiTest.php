<?php

namespace Kizlo\Tests\PostType;

use Kizlo\Modules\Introspection\ManagedContent;
use Kizlo\Modules\PostType\PublicContentApi;
use Kizlo\Modules\Preview\PreviewModule;
use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\Tests\TestCase;
use WP_REST_Request;
use WP_REST_Server;

final class PublicContentApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        wp_set_current_user(0);
        ManagedContent::flush();
        (new PublicContentApi())->register();
        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        do_action('rest_api_init', $wp_rest_server);
    }

    public function test_public_reads_never_accept_draft_status_or_edit_context(): void
    {
        $published = self::factory()->post->create(['post_status' => 'publish', 'post_content' => 'Visible content']);
        $draft = self::factory()->post->create(['post_status' => 'draft', 'post_content' => 'Secret draft']);
        $request = new WP_REST_Request('GET', '/kizlo/v1/content/post');
        $request->set_query_params(['status' => 'draft', 'context' => 'edit']);
        $response = rest_do_request($request);
        self::assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        self::assertSame([$published], array_column($response->get_data(), 'id'));
        self::assertArrayNotHasKey('raw', $response->get_data()[0]['content']);
        self::assertSame(404, rest_do_request(new WP_REST_Request('GET', '/kizlo/v1/content/post/' . $draft))->get_status());
    }

    public function test_password_protected_reads_hide_extension_values_and_never_return_the_password(): void
    {
        $id = self::factory()->post->create(['post_status' => 'publish', 'post_password' => 'secret-password', 'post_content' => 'Secret content']);
        $request = new WP_REST_Request('GET', '/kizlo/v1/content/post/' . $id);
        $locked = rest_do_request($request);
        self::assertSame(200, $locked->get_status(), wp_json_encode($locked->get_data()));
        self::assertNull($locked->get_data()['kizlo']);
        self::assertArrayNotHasKey('password', $locked->get_data());
        self::assertStringNotContainsString('Secret content', wp_json_encode($locked->get_data()));
        $wrong = new WP_REST_Request('GET', '/kizlo/v1/content/post/' . $id);
        $wrong->set_param('password', 'incorrect');
        self::assertSame(403, rest_do_request($wrong)->get_status());
        $request = new WP_REST_Request('GET', '/kizlo/v1/content/post/' . $id);
        $request->set_param('password', 'secret-password');
        $unlocked = rest_do_request($request);
        self::assertSame(200, $unlocked->get_status());
        self::assertStringContainsString('Secret content', $unlocked->get_data()['content']['rendered']);
        self::assertIsArray($unlocked->get_data()['kizlo']);
        self::assertArrayNotHasKey('password', $unlocked->get_data());
    }

    public function test_a_signed_preview_is_scoped_to_its_parent_and_tampering_fails(): void
    {
        (new SiteSettings())->setData(['secret' => 'test-preview-signing-secret'])->save();
        $parent = get_post(self::factory()->post->create(['post_status' => 'draft', 'post_title' => 'Original']));
        $other = self::factory()->post->create(['post_status' => 'publish']);
        $preview = get_post(self::factory()->post->create(['post_status' => 'kizlo_preview', 'post_parent' => $parent->ID, 'post_content' => 'Preview only']));
        $url = (new PreviewModule())->getPreviewUrl($parent, $preview);
        parse_str(parse_url($url, PHP_URL_QUERY), $params);
        $request = new WP_REST_Request('GET', '/kizlo/v1/content/post/' . $parent->ID);
        $request->set_param('preview_token', $params['preview_token']);
        $response = rest_do_request($request);
        self::assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        self::assertSame($preview->ID, $response->get_data()['id']);
        self::assertSame('private, no-store', $response->get_headers()['Cache-Control']);
        foreach ([[$other, $params['preview_token']], [$parent->ID, $params['preview_token'] . 'tampered']] as [$id, $token]) {
            $request = new WP_REST_Request('GET', '/kizlo/v1/content/post/' . $id);
            $request->set_param('preview_token', $token);
            self::assertSame(404, rest_do_request($request)->get_status());
        }
    }
}
