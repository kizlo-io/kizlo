<?php

namespace Kizlo\Tests\Seo;

use WP_REST_Request;
use Kizlo\Modules\Seo\SeoModule;

/**
 * The SEO REST callbacks: they resolve settings through the cache the same way a
 * real request does, and dispatch the sitemap-URL route to the right schema by type.
 */
class SeoModuleRouteTest extends SeoTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // seedSettings invalidates the settings cache, so the callbacks (which read
        // via Utils::getSettings) rebuild from these options on first access.
        $this->seedSettings();
        update_option('show_on_front', 'posts');
    }

    private function request(array $params = []): WP_REST_Request
    {
        $request = new WP_REST_Request('GET', '/kizlo/v1/seo');
        foreach ($params as $key => $value) {
            $request->set_param($key, $value);
        }
        return $request;
    }

    public function test_homepage_endpoint_returns_head_and_schema(): void
    {
        $response = (new SeoModule())->getHomepage($this->request());
        $data     = $response->get_data();

        $this->assertArrayHasKey('head', $data);
        $this->assertArrayHasKey('schema', $data);
        $this->assertSame('Example Site', $data['head']['title']);
        $this->assertSame('https://schema.org', $data['schema']['@context']);
    }

    public function test_robots_endpoint_returns_ruleset(): void
    {
        $data = (new SeoModule())->getRobots($this->request())->get_data();

        $this->assertArrayHasKey('rules', $data);
        $this->assertSame(['https://example.com/sitemaps/index.xml'], $data['sitemaps']);
    }

    public function test_sitemap_index_endpoint_returns_entries(): void
    {
        $this->createPost();

        $data = (new SeoModule())->getSitemaps($this->request())->get_data();
        $keys = array_column($data, 'key');

        $this->assertContains('post', $keys);
    }

    public function test_sitemap_urls_dispatch_post_type(): void
    {
        $this->createPost(['post_title' => 'Routed']);

        $data = (new SeoModule())->getSitemapsUrls($this->request(['type' => 'post_type', 'key' => 'post']))->get_data();

        $this->assertContains('https://example.com/routed/', array_column($data, 'loc'));
    }

    public function test_sitemap_urls_dispatch_taxonomy(): void
    {
        $category = self::factory()->category->create(['name' => 'Routed', 'slug' => 'routed-cat']);
        $post     = $this->createPost();
        wp_set_post_terms($post->ID, [$category], 'category');

        $data = (new SeoModule())->getSitemapsUrls($this->request(['type' => 'taxonomy', 'key' => 'category']))->get_data();

        $this->assertContains('https://example.com/category/routed-cat/', array_column($data, 'loc'));
    }

    public function test_sitemap_urls_unknown_type_is_bad_request(): void
    {
        $response = (new SeoModule())->getSitemapsUrls($this->request(['type' => 'nonsense']));

        $this->assertSame(400, $response->get_status());
        $this->assertNull($response->get_data());
    }
}
