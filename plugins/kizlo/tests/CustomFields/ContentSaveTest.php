<?php

namespace Kizlo\Tests\CustomFields;

use Kizlo\Tests\Seo\SeoTestCase;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\CustomFields\PostCustomFieldsMetaBox;
use Kizlo\Modules\CustomFields\TermCustomFieldsForm;

/**
 * The classic-form save handlers behind the post metabox and taxonomy forms: a
 * nonce-verified `kizlo_custom_fields` payload round-trips through the store, while
 * an invalid payload is rejected (no partial write) and flashed as an admin notice.
 */
class ContentSaveTest extends SeoTestCase
{
    protected function tearDown(): void
    {
        unset(
            $_POST['kizlo_custom_fields'],
            $_POST['kizlo_custom_fields_nonce'],
            $_POST['kizlo_custom_fields_term_nonce'],
        );
        delete_transient('kizlo_cf_error_' . get_current_user_id());

        parent::tearDown();
    }

    public function test_post_metabox_save_round_trips_values(): void
    {
        $definitions = FieldDefinitions::normalize([
            ['type' => 'text', 'name' => 'company_name'],
            ['type' => 'repeater', 'name' => 'features', 'fields' => [['type' => 'text', 'name' => 'title']]],
        ]);

        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => $definitions]]]);
        $this->actingAsAdmin();
        $post = $this->createPost();

        $_POST['kizlo_custom_fields_nonce'] = wp_create_nonce('kizlo_custom_fields_save');
        $_POST['kizlo_custom_fields']       = wp_json_encode([
            'company_name' => 'Acme Ltd',
            'features'      => [['title' => 'Fast'], ['title' => 'Secure']],
        ]);

        (new PostCustomFieldsMetaBox())->save($post->ID);

        $values = CustomFieldsStore::read(CustomFieldsStore::META_POST, $post->ID, $definitions);

        $this->assertSame('Acme Ltd', $values['company_name']);
        $this->assertSame([['title' => 'Fast'], ['title' => 'Secure']], $values['features']);
    }

    public function test_post_metabox_save_rejects_invalid_values_without_writing(): void
    {
        $definitions = FieldDefinitions::normalize([['type' => 'number', 'name' => 'rank', 'required' => true]]);

        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => $definitions]]]);
        $this->actingAsAdmin();
        $post = $this->createPost();

        $_POST['kizlo_custom_fields_nonce'] = wp_create_nonce('kizlo_custom_fields_save');
        $_POST['kizlo_custom_fields']       = wp_json_encode(['rank' => 'not-a-number']);

        (new PostCustomFieldsMetaBox())->save($post->ID);

        $this->assertSame('', get_post_meta($post->ID, 'kcf_rank', true), 'Nothing should be written on rejection.');
        $this->assertNotEmpty(get_transient('kizlo_cf_error_' . get_current_user_id()), 'A failure notice should be flashed.');
    }

    public function test_post_metabox_save_ignores_a_bad_nonce(): void
    {
        $definitions = FieldDefinitions::normalize([['type' => 'text', 'name' => 'company_name']]);

        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => $definitions]]]);
        $this->actingAsAdmin();
        $post = $this->createPost();

        $_POST['kizlo_custom_fields_nonce'] = 'invalid-nonce';
        $_POST['kizlo_custom_fields']       = wp_json_encode(['company_name' => 'Acme Ltd']);

        (new PostCustomFieldsMetaBox())->save($post->ID);

        $this->assertSame('', get_post_meta($post->ID, 'kcf_company_name', true));
    }

    public function test_term_form_save_round_trips_values(): void
    {
        $definitions = FieldDefinitions::normalize([['type' => 'text', 'name' => 'blurb']]);

        $this->seedSettings(['taxonomies' => ['category' => ['custom_fields' => $definitions]]]);
        $this->actingAsAdmin();
        $term_id = self::factory()->category->create(['name' => 'News']);

        $_POST['kizlo_custom_fields_term_nonce'] = wp_create_nonce('kizlo_custom_fields_term_save');
        $_POST['kizlo_custom_fields']            = wp_json_encode(['blurb' => 'All the news']);

        (new TermCustomFieldsForm())->save($term_id);

        $values = CustomFieldsStore::read(CustomFieldsStore::META_TERM, $term_id, $definitions);

        $this->assertSame('All the news', $values['blurb']);
    }
}
