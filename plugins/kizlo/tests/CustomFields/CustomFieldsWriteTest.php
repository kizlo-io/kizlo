<?php

namespace Kizlo\Tests\CustomFields;

use WP_Error;
use WP_REST_Request;
use Kizlo\Tests\Seo\SeoTestCase;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\CustomFields\CustomFieldsModule;
use Kizlo\Modules\CustomFields\CustomFieldsStore;

/**
 * The Kizlo REST write contract: custom-field values are read from the grouped
 * `custom` request property and validated before the row is created. A create
 * (POST) validates every definition, while an update (PUT/PATCH) validates only
 * the fields actually submitted so a partial edit leaves untouched fields,
 * including required ones, as they were.
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

    public function test_create_accepts_valid_grouped_custom_field_values(): void
    {
        $this->seed([['type' => 'text', 'name' => 'company_name']]);

        $this->assertNull($this->validate($this->request('POST', ['custom' => ['company_name' => 'Acme Ltd']])));
    }

    public function test_create_rejects_invalid_grouped_custom_field_values(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank']]);

        $result = $this->validate($this->request('POST', ['custom' => ['rank' => 'not-a-number']]));

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    public function test_create_rejects_a_missing_required_field_when_other_fields_are_sent(): void
    {
        $this->seed([
            ['type' => 'text', 'name' => 'subtitle'],
            ['type' => 'number', 'name' => 'rank', 'required' => true],
        ]);

        $result = $this->validate($this->request('POST', ['custom' => ['subtitle' => 'Hello']]));

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
        $this->assertNull($this->validate($this->request('PUT', ['custom' => ['subtitle' => 'Hello']])));
    }

    public function test_update_still_rejects_an_emptied_required_field(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank', 'required' => true]]);

        // Present in the payload but blank: a required field cannot be cleared.
        $result = $this->validate($this->request('PATCH', ['custom' => ['rank' => '']]));

        $this->assertInstanceOf(WP_Error::class, $result);
    }

    public function test_a_write_without_custom_field_keys_is_a_no_op(): void
    {
        $this->seed([['type' => 'number', 'name' => 'rank', 'required' => true]]);

        $this->assertNull($this->validate($this->request('POST', ['title' => 'Hello'])));
    }

    public function test_a_non_object_custom_group_is_rejected(): void
    {
        $this->seed([['type' => 'text', 'name' => 'subtitle']]);

        $result = $this->validate($this->request('PATCH', ['custom' => 'not-an-object']));

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame(400, $result->get_error_data()['status']);
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
        do_action('rest_after_insert_post', $post, $this->request('PUT', ['custom' => ['subtitle' => 'New']]));

        $this->assertSame('New', get_post_meta($post->ID, 'kcf_subtitle', true), 'The submitted field is updated.');
        $this->assertSame('5', get_post_meta($post->ID, 'kcf_rank', true), 'The omitted field keeps its stored value.');
    }

    public function test_image_fields_reject_non_image_attachments(): void
    {
        $this->seed([['type' => 'image', 'name' => 'cover']]);
        $attachment = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => 'video/mp4',
            'post_status'    => 'inherit',
        ]);

        $result = $this->validate($this->request('POST', ['custom' => ['cover' => $attachment]]));

        $this->assertInstanceOf(WP_Error::class, $result);
    }

    public function test_file_fields_accept_any_attachment_media_type(): void
    {
        $this->seed([['type' => 'file', 'name' => 'download']]);
        $attachment = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => 'application/pdf',
            'post_status'    => 'inherit',
        ]);

        $this->assertNull($this->validate($this->request('POST', ['custom' => ['download' => $attachment]])));
    }

    /** @dataProvider invalidConstrainedValueProvider */
    public function test_number_constraints_and_calendar_dates_reject_invalid_content(array $raw, mixed $value): void
    {
        $this->seed([$raw]);

        $result = $this->validate($this->request('POST', ['custom' => [$raw['name'] => $value]]));

        $this->assertInstanceOf(WP_Error::class, $result);
    }

    /** @return array<string, array{0: array<string, mixed>, 1: mixed}> */
    public function invalidConstrainedValueProvider(): array
    {
        $number = ['type' => 'number', 'name' => 'score', 'min' => 0, 'max' => 10, 'step' => 2];
        return [
            'below minimum' => [$number, -1],
            'above maximum' => [$number, 11],
            'off step' => [$number, 3],
            'non leap day' => [['type' => 'date', 'name' => 'launch'], '2025-02-29'],
            'invalid month and day' => [['type' => 'date', 'name' => 'launch'], '2026-13-40'],
        ];
    }

    public function test_number_constraints_accept_a_value_on_step(): void
    {
        $this->seed([['type' => 'number', 'name' => 'score', 'min' => 0, 'max' => 10, 'step' => 2]]);

        $this->assertNull($this->validate($this->request('POST', ['custom' => ['score' => 4]])));
    }

    public function test_required_group_needs_one_populated_descendant(): void
    {
        $this->seed([[
            'type' => 'group',
            'name' => 'details',
            'required' => true,
            'fields' => [['type' => 'text', 'name' => 'note']],
        ]]);

        $empty = $this->validate($this->request('POST', ['custom' => ['details' => ['note' => '']]]));

        $this->assertInstanceOf(WP_Error::class, $empty);
        $this->assertNull($this->validate($this->request('POST', ['custom' => ['details' => ['note' => 'Present']]])));
    }
}
