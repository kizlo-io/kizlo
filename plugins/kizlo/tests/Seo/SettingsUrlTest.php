<?php

namespace Kizlo\Tests\Seo;

class SettingsUrlTest extends SeoTestCase
{
    public function test_resolve_post_url_strips_wordpress_origin_with_port(): void
    {
        // With no Kizlo pathname structure, resolvePostUrl falls back to the WP
        // permalink, so pretty permalinks must be enabled for a path-based URL.
        $this->set_permalink_structure('/%postname%/');

        update_option('home', 'http://localhost:8080');
        update_option('siteurl', 'http://localhost:8080');

        $settings = $this->seedSettings([
            'site' => ['url' => 'http://localhost:3000'],
            'post_types' => ['post' => ['pathname_structure' => null]],
        ]);
        $post = $this->createPost(['post_title' => 'My New Post']);

        $this->assertSame(
            'http://localhost:3000/my-new-post/',
            $settings->resolvePostUrl($post, $settings->postTypes->get('post'))
        );
    }
}
