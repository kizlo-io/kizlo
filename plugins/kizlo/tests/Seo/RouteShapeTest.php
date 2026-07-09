<?php

namespace Kizlo\Tests\Seo;

use WP_REST_Request;
use Kizlo\Modules\Seo\SeoModule;

/**
 * Shape contract for the REST envelopes the web layer consumes. The route callbacks
 * only wrap the schema builders, so this pins the envelope keys (not the inner
 * payloads, which the builder shape suites already own) and the dispatch outcomes.
 */
class RouteShapeTest extends SeoTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
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

    public function test_homepage_envelope_shape(): void
    {
        $data = (new SeoModule())->getHomepage($this->request())->get_data();

        $this->assertShape(['head', 'schema'], $data);
        $this->assertShape(['title', 'canonical', 'robots', 'og', 'twitter', 'article'], $data['head']);
        $this->assertShape(['@context', '@graph'], $data['schema']);
    }

    public function test_robots_envelope_shape(): void
    {
        $data = (new SeoModule())->getRobots($this->request())->get_data();

        $this->assertShape(['rules', 'sitemaps'], $data);
    }

    public function test_sitemap_index_envelope_shape(): void
    {
        $this->createPost();

        $data = (new SeoModule())->getSitemaps($this->request())->get_data();

        $this->assertNotEmpty($data);
        foreach ($data as $entry) {
            $this->assertShape(['key', 'type', 'pages', 'lastmod'], $entry);
        }
    }

    public function test_sitemap_urls_entry_shape(): void
    {
        $this->createPost(['post_title' => 'Routed']);

        $data = (new SeoModule())->getSitemapsUrls($this->request(['type' => 'post_type', 'key' => 'post']))->get_data();

        $this->assertNotEmpty($data);
        foreach ($data as $entry) {
            $this->assertShape(['loc', 'lastmod', 'images'], $entry);
        }
    }

    public function test_unknown_sitemap_type_is_null_bad_request(): void
    {
        $response = (new SeoModule())->getSitemapsUrls($this->request(['type' => 'nonsense']));

        $this->assertSame(400, $response->get_status());
        $this->assertNull($response->get_data());
    }
}
