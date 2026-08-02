<?php

namespace Kizlo\Tests\Headless;

use WP_REST_Response;
use Kizlo\Modules\Headless\ViewLinks;

/**
 * View-post links: with the toggle on, editor and REST "View" links point at the
 * headless frontend, while public permalinks and the editable slug stay native.
 */
class ViewLinksTest extends HeadlessTestCase
{
    protected function tearDown(): void
    {
        set_current_screen('front');
        parent::tearDown();
    }

    private function post(): \WP_Post
    {
        return self::factory()->post->create_and_get([
            'post_type'   => 'post',
            'post_status' => 'publish',
            'post_name'   => 'hello-world',
        ]);
    }

    public function test_permalink_points_at_the_frontend_in_admin(): void
    {
        $this->bootHeadless(['enabled' => true, 'view_links' => true]);
        set_current_screen('edit.php');

        $url = get_permalink($this->post());

        $this->assertStringStartsWith(self::BASE_URL, $url);
        $this->assertStringContainsString('hello-world', $url);
    }

    public function test_permalink_stays_native_on_the_public_frontend(): void
    {
        $this->bootHeadless(['enabled' => true, 'view_links' => true]);
        set_current_screen('front');

        $url = get_permalink($this->post());

        $this->assertStringStartsWith(home_url(), $url);
        $this->assertStringNotContainsString(self::BASE_URL, $url);
    }

    public function test_sample_permalink_is_left_native_so_the_slug_editor_works(): void
    {
        $this->bootHeadless(['enabled' => true, 'view_links' => true]);
        set_current_screen('edit.php');

        // Sample permalinks (leavename) drive the editable slug UI and must not be rewritten.
        $sample = get_permalink($this->post(), true);

        $this->assertStringStartsWith(home_url(), $sample);
    }

    public function test_rest_link_field_is_overridden(): void
    {
        $this->seedHeadless(['enabled' => true, 'view_links' => true]);

        $post = $this->post();
        $response = new WP_REST_Response(['link' => get_permalink($post)]);

        $filtered = (new ViewLinks())->filterRestLink($response, $post);
        $link = $filtered->get_data()['link'];

        $this->assertStringStartsWith(self::BASE_URL, $link);
        $this->assertStringContainsString('hello-world', $link);
    }

    public function test_rest_permalink_template_shows_the_frontend_origin(): void
    {
        $this->seedHeadless(['enabled' => true, 'view_links' => true]);

        $post = $this->post();
        $response = new WP_REST_Response([
            'link'               => get_permalink($post),
            'permalink_template' => home_url('/%postname%/'),
        ]);

        $template = (new ViewLinks())->filterRestLink($response, $post)->get_data()['permalink_template'];

        $this->assertStringStartsWith(self::BASE_URL, $template);
        // The editable slug placeholder is preserved for the block editor.
        $this->assertStringContainsString('%postname%', $template);
    }

    public function test_sample_permalink_display_shows_the_frontend_origin(): void
    {
        $this->seedHeadless(['enabled' => true, 'view_links' => true]);

        $native = home_url('/hello-world/');
        $html = '<span id="sample-permalink"><a href="' . $native . '">' . $native . '</a></span>';

        $filtered = (new ViewLinks())->filterSamplePermalinkHtml($html);

        $this->assertStringContainsString(self::BASE_URL . '/hello-world/', $filtered);
        $this->assertStringNotContainsString(home_url(), $filtered);
    }

    public function test_view_links_off_keeps_native_permalinks_in_admin(): void
    {
        $this->bootHeadless(['enabled' => true, 'view_links' => false]);
        set_current_screen('edit.php');

        $url = get_permalink($this->post());

        $this->assertStringStartsWith(home_url(), $url);
    }
}
