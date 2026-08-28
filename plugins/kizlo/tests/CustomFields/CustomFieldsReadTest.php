<?php

namespace Kizlo\Tests\CustomFields;

use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Tests\Seo\SeoTestCase;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\Post\PostExtension as CorePostExtension;
use Kizlo\Modules\PostType\PostTypeExtension;
use Kizlo\Modules\Taxonomy\TermExtension;

/**
 * The API read contract: the post-type REST response the Kizlo frontend reads
 * carries resolved custom-field values in `kizlo.custom`, keyed by field name and
 * nested exactly as configured, while nothing leaks onto the resource root or
 * into the native `meta` object.
 */
class CustomFieldsReadTest extends SeoTestCase
{
    public function test_post_type_response_groups_custom_fields_inside_kizlo(): void
    {
        $defs = FieldDefinitions::normalize([
            ['type' => 'text', 'name' => 'company_name'],
            ['type' => 'repeater', 'name' => 'features', 'fields' => [['type' => 'text', 'name' => 'title']]],
        ]);

        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => $defs]]]);

        $post = $this->createPost();
        CustomFieldsStore::write(CustomFieldsStore::META_POST, $post->ID, $defs, [
            'company_name' => 'Acme Ltd',
            'features'     => [['title' => 'Fast'], ['title' => 'Secure']],
        ]);

        $data = (new PostTypeExtension())->extendSingle(['id' => $post->ID, 'author' => $post->post_author]);

        $custom = (array) $data['kizlo']['custom'];

        $this->assertSame('Acme Ltd', $custom['company_name']);
        $this->assertSame([['title' => 'Fast'], ['title' => 'Secure']], $custom['features']);
        $this->assertArrayNotHasKey('company_name', $data);
        $this->assertArrayNotHasKey('features', $data);
    }

    public function test_a_custom_field_may_share_a_name_with_a_core_response_key(): void
    {
        $defs = FieldDefinitions::normalize([['type' => 'text', 'name' => 'author']]);
        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => $defs]]]);

        $post = $this->createPost();
        CustomFieldsStore::write(CustomFieldsStore::META_POST, $post->ID, $defs, ['author' => 'overwrite attempt']);

        $data = (new PostTypeExtension())->extendSingle(['id' => $post->ID, 'author' => $post->post_author]);

        $this->assertSame($post->post_author, $data['author']);
        $this->assertSame('overwrite attempt', ((array) $data['kizlo']['custom'])['author']);
    }

    public function test_a_taxonomy_response_groups_custom_fields_inside_kizlo(): void
    {
        $defs = FieldDefinitions::normalize([['type' => 'text', 'name' => 'banner']]);
        $this->seedSettings(['taxonomies' => ['category' => ['custom_fields' => $defs]]]);

        $term_id = self::factory()->term->create(['taxonomy' => 'category', 'name' => 'News']);
        $term    = get_term($term_id, 'category');
        $this->assertInstanceOf(\WP_Term::class, $term);
        CustomFieldsStore::write(CustomFieldsStore::META_TERM, $term_id, $defs, ['banner' => 'Latest']);

        $response = (new TermExtension())->prepare(
            new WP_REST_Response(['id' => $term_id]),
            $term,
            new WP_REST_Request('GET', '/wp/v2/categories'),
        );
        $data = $response->get_data();

        $this->assertSame('Latest', ((array) $data['kizlo']['custom'])['banner']);
        $this->assertArrayNotHasKey('banner', $data);
    }

    public function test_a_core_post_response_uses_the_same_grouped_shape(): void
    {
        $defs = FieldDefinitions::normalize([['type' => 'text', 'name' => 'company_name']]);
        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => $defs]]]);

        $post = $this->createPost();
        CustomFieldsStore::write(CustomFieldsStore::META_POST, $post->ID, $defs, ['company_name' => 'Acme Ltd']);

        $response = (new CorePostExtension())->prepare(
            new WP_REST_Response(['id' => $post->ID]),
            $post,
            new WP_REST_Request('GET', '/wp/v2/posts'),
        );
        $data = $response->get_data();

        $this->assertSame('Acme Ltd', ((array) $data['kizlo']['custom'])['company_name']);
        $this->assertArrayNotHasKey('company_name', $data);
    }

    public function test_a_site_without_definitions_returns_an_empty_custom_object(): void
    {
        $this->seedSettings();
        $post = $this->createPost();

        $data = (new PostTypeExtension())->extendListItem(['id' => $post->ID, 'author' => $post->post_author]);

        $this->assertIsObject($data['kizlo']['custom']);
        $this->assertSame([], (array) $data['kizlo']['custom']);
    }

    public function test_internal_keys_do_not_leak_into_native_rest_meta(): void
    {
        $defs = FieldDefinitions::normalize([['type' => 'text', 'name' => 'company_name']]);
        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => $defs]]]);

        $post = $this->createPost();
        CustomFieldsStore::write(CustomFieldsStore::META_POST, $post->ID, $defs, ['company_name' => 'Acme Ltd']);

        $registered = get_registered_meta_keys('post', 'post');

        $this->assertArrayNotHasKey('kcf_company_name', $registered);
        $this->assertArrayNotHasKey('_kcf_company_name', $registered);
    }
}
