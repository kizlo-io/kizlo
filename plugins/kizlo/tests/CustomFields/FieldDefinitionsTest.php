<?php

namespace Kizlo\Tests\CustomFields;

use Kizlo\Tests\TestCase;
use Kizlo\Modules\CustomFields\FieldDefinitions;

/**
 * Normalization is the gate every raw definition passes through: it mints a
 * permanent `field_*` key, locks the name to its first-saved value, drops invalid
 * entries, and recurses into groups and repeaters.
 */
class FieldDefinitionsTest extends TestCase
{
    public function test_mints_a_field_key_and_normalizes_the_name(): void
    {
        $result = FieldDefinitions::normalize([
            ['type' => 'text', 'name' => 'Company Name', 'label' => 'Company'],
        ]);

        $this->assertCount(1, $result);
        $this->assertMatchesRegularExpression('/^field_[a-z0-9]+$/', $result[0]['key']);
        $this->assertSame('company_name', $result[0]['name']);
        $this->assertSame('Company', $result[0]['label']);
        $this->assertFalse($result[0]['required']);
    }

    public function test_name_locks_to_its_first_saved_value(): void
    {
        $previous = [['key' => 'field_abc123', 'name' => 'original', 'type' => 'text', 'label' => '', 'instructions' => '', 'required' => false, 'default' => null]];

        $result = FieldDefinitions::normalize([
            ['key' => 'field_abc123', 'type' => 'text', 'name' => 'renamed_attempt'],
        ], $previous);

        $this->assertSame('original', $result[0]['name']);
    }

    public function test_drops_entries_with_unknown_types(): void
    {
        $result = FieldDefinitions::normalize([
            ['type' => 'text', 'name' => 'ok'],
            ['type' => 'wysiwyg_bogus', 'name' => 'bad'],
            ['type' => 'number', 'name' => 'count'],
        ]);

        $this->assertSame(['ok', 'count'], array_column($result, 'name'));
    }

    public function test_normalizes_select_choices_and_defaults(): void
    {
        $result = FieldDefinitions::normalize([
            [
                'type'    => 'select',
                'name'    => 'plan',
                'choices' => [
                    ['value' => 'free', 'label' => 'Free'],
                    ['value' => 'paid', 'label' => ''],
                ],
                'default' => 'free',
            ],
        ]);

        $this->assertSame([
            ['value' => 'free', 'label' => 'Free'],
            ['value' => 'paid', 'label' => 'paid'],
        ], $result[0]['choices']);
        $this->assertSame('free', $result[0]['default']);
    }

    public function test_textarea_defaults_preserve_line_breaks(): void
    {
        $result = FieldDefinitions::normalize([
            ['type' => 'textarea', 'name' => 'summary', 'default' => "first\r\nsecond"],
        ]);

        $this->assertSame("first\r\nsecond", $result[0]['default']);
    }

    public function test_rejects_fractional_repeater_bounds_during_normalization(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        FieldDefinitions::normalize([
            ['type' => 'repeater', 'name' => 'items', 'min' => 0.5, 'fields' => []],
        ]);
    }

    public function test_recurses_into_groups_and_repeaters(): void
    {
        $result = FieldDefinitions::normalize([
            [
                'type'   => 'repeater',
                'name'   => 'features',
                'max'    => 3,
                'fields' => [
                    ['type' => 'text', 'name' => 'title'],
                    [
                        'type'   => 'group',
                        'name'   => 'meta',
                        'fields' => [['type' => 'toggle', 'name' => 'featured', 'default' => true]],
                    ],
                ],
            ],
        ]);

        $this->assertSame('repeater', $result[0]['type']);
        $this->assertSame(3, $result[0]['max']);
        $this->assertSame('title', $result[0]['fields'][0]['name']);
        $this->assertSame('meta', $result[0]['fields'][1]['name']);
        $this->assertTrue($result[0]['fields'][1]['fields'][0]['default']);
    }
}
