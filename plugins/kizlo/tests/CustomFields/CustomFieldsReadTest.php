<?php

namespace Kizlo\Tests\CustomFields;

use Kizlo\Tests\Seo\SeoTestCase;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\PostType\PostTypeExtension;

/**
 * The API read contract: the post-type REST response the Kizlo frontend reads
 * carries resolved custom-field values at the response root, keyed by field name
 * and nested exactly as configured, while nothing leaks into the native `meta`
 * object or the `kizlo` enrichment block.
 */
class CustomFieldsReadTest extends SeoTestCase
{
    public function test_post_type_response_carries_root_custom_fields(): void
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

        $this->assertSame('Acme Ltd', $data['company_name']);
        $this->assertSame([['title' => 'Fast'], ['title' => 'Secure']], $data['features']);
        $this->assertArrayNotHasKey('custom_fields', (array) $data['kizlo']);
    }

    public function test_injection_never_clobbers_an_existing_response_key(): void
    {
        // A definition whose name collides with an existing key is normally
        // blocked at save; here it is seeded directly to prove the read-time guard.
        $defs = FieldDefinitions::normalize([['type' => 'text', 'name' => 'author']]);
        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => $defs]]]);

        $post = $this->createPost();
        CustomFieldsStore::write(CustomFieldsStore::META_POST, $post->ID, $defs, ['author' => 'overwrite attempt']);

        $data = (new PostTypeExtension())->extendSingle(['id' => $post->ID, 'author' => $post->post_author]);

        $this->assertSame($post->post_author, $data['author']);
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
