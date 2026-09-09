<?php

namespace Kizlo\Tests\Introspection;

/**
 * The two schema hooks on the `custom` block let any plugin contribute a
 * namespaced sub-object into `kizlo.custom` without core naming the integration.
 * They are the description half of the pair the runtime value filters complete.
 *
 * The filters fire once per managed object, receiving the assembled custom
 * `properties` and that object's slug, so a listener can scope its contribution
 * by slug — the property lands only under the objects it chose. With no listener
 * the document is exactly what it was before the hook existed.
 */
class CustomSchemaFilterTest extends IntrospectionTestCase
{
    protected function tearDown(): void
    {
        remove_all_filters('kizlo_post_type_custom_schema');
        remove_all_filters('kizlo_taxonomy_custom_schema');

        parent::tearDown();
    }

    /**
     * The custom block's properties for a built schema, as an array. An empty map
     * serializes to a stdClass in the document, so it is normalized here.
     *
     * @return array<string, mixed>
     */
    private function customProperties(string $schemaId): array
    {
        $custom = $this->document()['schemas'][$schemaId]['properties']['kizlo']['properties']['custom'];

        return (array) $custom['properties'];
    }

    public function test_the_post_type_schema_filter_scopes_by_slug(): void
    {
        $seen = [];

        add_filter('kizlo_post_type_custom_schema', function (array $properties, string $slug) use (&$seen): array {
            $seen[] = $slug;

            if ($slug === 'post') {
                $properties['acme'] = ['type' => 'object', 'required' => true];
            }

            return $properties;
        }, 10, 2);

        $post = $this->customProperties('post-types.post.item');
        $page = $this->customProperties('post-types.page.item');

        $this->assertContains('post', $seen, 'The filter fires for each managed post type.');
        $this->assertContains('page', $seen);
        $this->assertSame(['type' => 'object', 'required' => true], $post['acme']);
        $this->assertArrayNotHasKey('acme', $page, 'The slug scopes the contribution.');
    }

    public function test_the_taxonomy_schema_filter_scopes_by_slug(): void
    {
        $seen = [];

        add_filter('kizlo_taxonomy_custom_schema', function (array $properties, string $slug) use (&$seen): array {
            $seen[] = $slug;

            if ($slug === 'category') {
                $properties['acme'] = ['type' => 'object', 'required' => true];
            }

            return $properties;
        }, 10, 2);

        $category = $this->customProperties('taxonomies.category.item');
        $post_tag = $this->customProperties('taxonomies.post_tag.item');

        $this->assertContains('category', $seen);
        $this->assertSame(['type' => 'object', 'required' => true], $category['acme']);
        $this->assertArrayNotHasKey('acme', $post_tag);
    }

    public function test_without_a_listener_the_custom_block_carries_no_contributed_property(): void
    {
        $this->assertArrayNotHasKey('acme', $this->customProperties('post-types.post.item'));
        $this->assertArrayNotHasKey('acme', $this->customProperties('taxonomies.category.item'));

        $custom = $this->document()['schemas']['post-types.post.item']['properties']['kizlo']['properties']['custom'];
        $this->assertTrue($custom['required'], 'The default custom block is untouched.');
    }
}
