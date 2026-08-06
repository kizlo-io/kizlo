<?php

namespace Kizlo\Tests\CustomFields;

use WP_Error;
use WP_REST_Request;
use Kizlo\Tests\Seo\SeoTestCase;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\CustomFields\CustomFieldsModule;
use Kizlo\Modules\CustomFields\CustomFieldsStore;

/**
 * The Kizlo REST write contract: custom-field values are read from the request
 * root (keyed by field name, the same shape reads come back as) and validated
 * before the row is created. A create (POST) validates every definition, while an
 * update (PUT/PATCH) validates only the fields actually submitted so a partial
 * edit leaves untouched fields — including required ones — as they were.
 */
class CustomFieldsWriteTest extends SeoTestCase
{
    private function request(string $method, array $params): WP_REST_Request
    {
        $request = new WP_REST_Request($method, '/kizlo/v1/post-types/post');
        $request->set_param('post_type', 'post');
        foreach ($params as $key => $value) {
            $request->set_param($key, $value);
        }
        return $request;
    }

    private function validate(WP_REST_Request $request): mixed
    {
        return (new CustomFieldsModule())->validateRequest(null, null, $request);
    }

    private function seed(array $raw): void
    {
        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => FieldDefinitions::normalize($raw)]]]);
    }

    public function test_create_accepts_valid_root_custom_field_values(): void
    {
        $this->seed([['type' => 'text', 'name' => 'company_name']]);

        $this->assertNull($this->validate($this->request('POST', ['company_name' => 'Acme Ltd'])));
    }

    public function test_create_rejects_invalid_root_custom_field_values(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank']]);

        $result = $this->validate($this->request('POST', ['rank' => 'not-a-number']));

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    public function test_create_rejects_a_missing_required_field_when_other_fields_are_sent(): void
    {
        $this->seed([
            ['type' => 'text', 'name' => 'subtitle'],
            ['type' => 'number', 'name' => 'rank', 'required' => true],
        ]);

        $result = $this->validate($this->request('POST', ['subtitle' => 'Hello']));

        $this->assertInstanceOf(WP_Error::class, $result);
    }

    public function test_update_allows_omitting_an_untouched_required_field(): void
    {
        $this->seed([
            ['type' => 'text', 'name' => 'subtitle'],
            ['type' => 'number', 'name' => 'rank', 'required' => true],
        ]);

        // Only `subtitle` is submitted, so the untouched required `rank` is left
        // alone rather than being reported as missing.
        $this->assertNull($this->validate($this->request('PUT', ['subtitle' => 'Hello'])));
    }

    public function test_update_still_rejects_an_emptied_required_field(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank', 'required' => true]]);

        // Present in the payload but blank: a required field cannot be cleared.
        $result = $this->validate($this->request('PATCH', ['rank' => '']));

        $this->assertInstanceOf(WP_Error::class, $result);
    }

    public function test_a_write_without_custom_field_keys_is_a_no_op(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank', 'required' => true]]);

        $this->assertNull($this->validate($this->request('POST', ['title' => 'Hello'])));
    }

    public function test_update_persists_the_submitted_field_and_leaves_the_rest_untouched(): void
    {
        $defs = FieldDefinitions::normalize([
            ['type' => 'text', 'name' => 'subtitle'],
            ['type' => 'number', 'name' => 'rank'],
        ]);
        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => $defs]]]);

        $post = $this->createPost();
        CustomFieldsStore::write(CustomFieldsStore::META_POST, $post->ID, $defs, ['subtitle' => 'Old', 'rank' => 5]);

        // Drive the real insert hook with an update that touches only `subtitle`.
        (new CustomFieldsModule())->register();
        do_action('rest_after_insert_post', $post, $this->request('PUT', ['subtitle' => 'New']));

        $this->assertSame('New', get_post_meta($post->ID, 'kcf_subtitle', true), 'The submitted field is updated.');
        $this->assertSame('5', get_post_meta($post->ID, 'kcf_rank', true), 'The omitted field keeps its stored value.');
    }
}