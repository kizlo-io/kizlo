<?php

namespace Kizlo\Tests\RestApi;

use WP_REST_Request;
use WP_REST_Server;
use Kizlo\Tests\Seo\SeoTestCase;
use Kizlo\Modules\Post\PostExtension;
use Kizlo\Modules\Settings\Settings;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\CustomFields\CustomFieldsStore;

/** The Kizlo envelope attached to WordPress's own post and term routes. */
class CoreEnvelopeTest extends SeoTestCase
{
    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();

        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        do_action('rest_api_init', $this->server);
    }

    public function test_included_post_type_reads_carry_only_the_core_envelope(): void
    {
        $definitions = FieldDefinitions::normalize([['type' => 'text', 'name' => 'banner']]);
        $this->seedSettings(['post_types' => ['page' => ['custom_fields' => $definitions]]]);

        $id = self::factory()->post->create([
            'post_type'   => 'page',
            'post_status' => 'publish',
            'post_title'  => 'About',
        ]);
        CustomFieldsStore::write(CustomFieldsStore::META_POST, $id, $definitions, ['banner' => 'Hello']);

        $single = $this->dispatch('GET', '/wp/v2/pages/' . $id)->get_data()['kizlo'];
        $list   = $this->find($this->dispatch('GET', '/wp/v2/pages')->get_data(), $id)['kizlo'];

        $this->assertSame('Hello', ((array) $single['custom'])['banner']);
        $this->assertArrayHasKey('seo', $single);
        $this->assertSame(['custom', 'extend'], $this->sorted(array_keys($list)));

        foreach (['tags', 'author', 'categories', 'featured_image'] as $field) {
            $this->assertArrayNotHasKey($field, $single);
            $this->assertArrayNotHasKey($field, $list);
        }
    }

    public function test_included_taxonomy_reads_carry_only_the_core_envelope(): void
    {
        $definitions = FieldDefinitions::normalize([['type' => 'text', 'name' => 'banner']]);
        $this->seedSettings(['taxonomies' => ['category' => ['custom_fields' => $definitions]]]);

        $id = self::factory()->term->create(['taxonomy' => 'category', 'name' => 'News']);
        CustomFieldsStore::write(CustomFieldsStore::META_TERM, $id, $definitions, ['banner' => 'Latest']);

        $single = $this->dispatch('GET', '/wp/v2/categories/' . $id)->get_data()['kizlo'];
        $list   = $this->find($this->dispatch('GET', '/wp/v2/categories')->get_data(), $id)['kizlo'];

        $this->assertSame('Latest', ((array) $single['custom'])['banner']);
        $this->assertArrayHasKey('seo', $single);
        $this->assertSame(['custom', 'extend'], $this->sorted(array_keys($list)));

        foreach (['id', 'name', 'slug', 'description', 'parent', 'count', 'url'] as $field) {
            $this->assertArrayNotHasKey($field, $single);
            $this->assertArrayNotHasKey($field, $list);
        }
    }

    public function test_an_included_type_with_seo_disabled_omits_seo(): void
    {
        $id    = $this->createImage();
        $kizlo = $this->dispatch('GET', '/wp/v2/media/' . $id)->get_data()['kizlo'];

        $this->assertSame(['custom', 'extend'], $this->sorted(array_keys($kizlo)));
    }

    public function test_a_rest_type_gains_the_envelope_only_after_it_is_included(): void
    {
        register_post_type('kizlo_probe', [
            'public'       => true,
            'show_in_rest' => true,
            'rest_base'    => 'kizlo-probes',
            'supports'     => ['title'],
        ]);
        get_post_type_object('kizlo_probe')->get_rest_controller()->register_routes();

        $id = self::factory()->post->create([
            'post_type'   => 'kizlo_probe',
            'post_status' => 'publish',
        ]);

        $this->assertArrayNotHasKey('kizlo', $this->dispatch('GET', '/wp/v2/kizlo-probes/' . $id)->get_data());

        $include = static fn(array $postTypes): array => [...$postTypes, 'kizlo_probe'];
        add_filter('kizlo_included_post_types', $include);

        try {
            Settings::invalidateCache();
            (new PostExtension())->register();

            $this->assertArrayHasKey('kizlo', $this->dispatch('GET', '/wp/v2/kizlo-probes/' . $id)->get_data());
        } finally {
            remove_filter('kizlo_included_post_types', $include);
            Settings::invalidateCache();
        }
    }

    public function test_managed_routes_keep_their_enhanced_payload(): void
    {
        $category = self::factory()->category->create(['name' => 'News']);
        $post     = self::factory()->post->create([
            'post_status'   => 'publish',
            'post_category' => [$category],
        ]);

        $postKizlo = $this->dispatch('GET', '/kizlo/v1/post-types/post/' . $post)->get_data()['kizlo'];
        $termKizlo = $this->dispatch('GET', '/kizlo/v1/taxonomies/category/' . $category)->get_data()['kizlo'];

        foreach (['url', 'categories', 'author', 'seo', 'custom', 'extend'] as $field) {
            $this->assertArrayHasKey($field, $postKizlo);
        }

        foreach (['id', 'name', 'slug', 'description', 'parent', 'count', 'url', 'seo', 'custom', 'extend'] as $field) {
            $this->assertArrayHasKey($field, $termKizlo);
        }
    }

    private function dispatch(string $method, string $route): \WP_REST_Response
    {
        return $this->server->dispatch(new WP_REST_Request($method, $route));
    }

    /**
     * @param array<int, array<string, mixed>> $items
     * @return array<string, mixed>
     */
    private function find(array $items, int $id): array
    {
        foreach ($items as $item) {
            if (($item['id'] ?? null) === $id) {
                return $item;
            }
        }

        $this->fail(sprintf('Response did not contain item %d.', $id));
    }

    /** @param string[] $values */
    private function sorted(array $values): array
    {
        sort($values);
        return $values;
    }
}
