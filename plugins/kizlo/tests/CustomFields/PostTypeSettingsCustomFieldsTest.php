<?php

namespace Kizlo\Tests\CustomFields;

use InvalidArgumentException;
use Kizlo\Tests\TestCase;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;

/**
 * Custom-field definitions flow through the same validate → sanitize pipeline as
 * every other setting: valid definitions normalize and persist, while an unsafe
 * definition throws and leaves the previously saved definitions untouched.
 */
class PostTypeSettingsCustomFieldsTest extends TestCase
{
    public function test_valid_definitions_are_normalized_and_stored(): void
    {
        $settings = new PostTypeSettings();
        $settings->setData(['custom_fields' => [
            ['type' => 'text', 'name' => 'Company Name', 'label' => 'Company'],
        ]]);

        $fields = $settings->getCustomFields();

        $this->assertCount(1, $fields);
        $this->assertSame('company_name', $fields[0]['name']);
        $this->assertMatchesRegularExpression('/^field_[a-z0-9]+$/', $fields[0]['key']);
    }

    public function test_an_unsafe_definition_rejects_the_update_and_preserves_the_previous(): void
    {
        $settings = new PostTypeSettings();
        $settings->setData(['custom_fields' => [['type' => 'text', 'name' => 'ok']]]);

        try {
            $settings->setData(['custom_fields' => [['type' => 'text', 'name' => str_repeat('a', 260)]]]);
            $this->fail('Expected the oversized key to be rejected.');
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString('255', $e->getMessage());
        }

        // The rejected update never touched the stored definitions.
        $this->assertSame('ok', $settings->getCustomFields()[0]['name']);
    }

    public function test_a_field_may_share_a_name_with_a_core_response_property(): void
    {
        $settings = new PostTypeSettings();

        $settings->setData(['custom_fields' => [['type' => 'text', 'name' => 'content']]]);

        $this->assertSame('content', $settings->getCustomFields()[0]['name']);
    }

    public function test_getData_exposes_custom_fields_for_the_settings_response(): void
    {
        $settings = new PostTypeSettings();
        $settings->setData(['custom_fields' => [['type' => 'number', 'name' => 'rank']]]);

        $data = $settings->getData();

        $this->assertArrayHasKey('custom_fields', $data);
        $this->assertSame('rank', $data['custom_fields'][0]['name']);
    }
}
