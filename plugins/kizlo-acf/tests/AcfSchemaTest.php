<?php

namespace Kizlo\Acf\Tests;

use PHPUnit\Framework\TestCase;
use Kizlo\Acf\Modules\Acf\AcfSchema;

/**
 * The ACF-to-Kizlo schema mapper.
 *
 * Each supported ACF field type is checked against the schema Kizlo publishes for
 * it, including the choice enums, the media `$ref`s, group and repeater nesting,
 * and the permissive fallback that keeps an unknown type from breaking the
 * contract. The mapper is pure, so the fields are hand-built rather than read
 * from a live ACF install.
 */
class AcfSchemaTest extends TestCase
{
    /**
     * The schema the mapper emits for a single field definition.
     *
     * @param array<string, mixed> $definition
     * @return array<string, mixed>
     */
    private function field(array $definition): array
    {
        $definition['name'] ??= 'f';
        $group = AcfSchema::responseGroup([$definition]);

        return $group['properties'][$definition['name']];
    }

    public function test_the_group_is_a_required_object_keyed_by_field_name(): void
    {
        $group = AcfSchema::responseGroup([
            ['name' => 'one', 'type' => 'text'],
            ['name' => 'two', 'type' => 'number'],
        ]);

        $this->assertSame('object', $group['type']);
        $this->assertTrue($group['required']);
        $this->assertSame(['one', 'two'], array_keys($group['properties']));
    }

    public function test_a_field_with_no_name_is_skipped(): void
    {
        $group = AcfSchema::responseGroup([['type' => 'text'], ['name' => 'kept', 'type' => 'text']]);

        $this->assertSame(['kept'], array_keys($group['properties']));
    }

    public function test_text_types_map_to_strings(): void
    {
        foreach (['text', 'textarea', 'wysiwyg', 'password'] as $type) {
            $this->assertSame('string', $this->field(['type' => $type])['type'], $type);
        }
    }

    public function test_formatted_strings_carry_their_format(): void
    {
        $this->assertSame(['type' => 'string', 'format' => 'email'], $this->plain(['type' => 'email']));
        $this->assertSame(['type' => 'string', 'format' => 'uri'], $this->plain(['type' => 'url']));
    }

    public function test_numbers_are_nullable(): void
    {
        foreach (['number', 'range'] as $type) {
            $schema = $this->field(['type' => $type]);
            $this->assertSame('number', $schema['type']);
            $this->assertTrue($schema['nullable']);
        }
    }

    public function test_true_false_maps_to_a_boolean(): void
    {
        $this->assertSame('boolean', $this->field(['type' => 'true_false'])['type']);
    }

    public function test_a_select_maps_choice_keys_onto_an_enum(): void
    {
        $schema = $this->field(['type' => 'select', 'choices' => ['s' => 'Small', 'l' => 'Large']]);

        $this->assertSame('string', $schema['type']);
        $this->assertSame(['s', 'l'], $schema['enum']);
    }

    public function test_a_multiple_select_maps_to_an_array_of_enum_values(): void
    {
        $schema = $this->field(['type' => 'select', 'multiple' => 1, 'choices' => ['a' => 'A', 'b' => 'B']]);

        $this->assertSame('array', $schema['type']);
        $this->assertSame(['a', 'b'], $schema['items']['enum']);
    }

    public function test_radio_and_button_group_map_to_a_string_enum(): void
    {
        foreach (['radio', 'button_group'] as $type) {
            $schema = $this->field(['type' => $type, 'choices' => ['y' => 'Yes', 'n' => 'No']]);
            $this->assertSame('string', $schema['type'], $type);
            $this->assertSame(['y', 'n'], $schema['enum'], $type);
        }
    }

    public function test_a_choice_field_with_no_choices_carries_no_enum(): void
    {
        $schema = $this->field(['type' => 'select']);

        $this->assertSame('string', $schema['type']);
        $this->assertArrayNotHasKey('enum', $schema);
    }

    public function test_a_checkbox_maps_to_an_array_of_enum_values(): void
    {
        $schema = $this->field(['type' => 'checkbox', 'choices' => ['a' => 'A', 'b' => 'B']]);

        $this->assertSame('array', $schema['type']);
        $this->assertSame(['a', 'b'], $schema['items']['enum']);
    }

    public function test_date_and_time_pickers_carry_their_format(): void
    {
        $this->assertSame('date', $this->field(['type' => 'date_picker'])['format']);
        $this->assertSame('date-time', $this->field(['type' => 'date_time_picker'])['format']);
        $this->assertSame('time', $this->field(['type' => 'time_picker'])['format']);
    }

    public function test_image_and_file_map_to_kizlo_media_refs(): void
    {
        $image = $this->field(['type' => 'image']);
        $file  = $this->field(['type' => 'file']);

        $this->assertSame('kizlo.media-image', $image['$ref']);
        $this->assertTrue($image['nullable']);
        $this->assertTrue($image['required']);

        $this->assertSame('kizlo.media', $file['$ref']);
        $this->assertTrue($file['nullable']);
    }

    public function test_a_gallery_maps_to_an_array_of_image_media(): void
    {
        $schema = $this->field(['type' => 'gallery']);

        $this->assertSame('array', $schema['type']);
        $this->assertSame('kizlo.media-image', $schema['items']['$ref']);
    }

    public function test_a_single_object_reference_maps_to_a_nullable_integer(): void
    {
        foreach (['post_object', 'user', 'page_link'] as $type) {
            $schema = $this->field(['type' => $type]);
            $this->assertSame('integer', $schema['type'], $type);
            $this->assertTrue($schema['nullable'], $type);
        }
    }

    public function test_a_multiple_object_reference_maps_to_an_array_of_integers(): void
    {
        $schema = $this->field(['type' => 'post_object', 'multiple' => 1]);

        $this->assertSame('array', $schema['type']);
        $this->assertSame('integer', $schema['items']['type']);
    }

    public function test_a_relationship_is_always_an_array_of_integers(): void
    {
        $schema = $this->field(['type' => 'relationship']);

        $this->assertSame('array', $schema['type']);
        $this->assertSame('integer', $schema['items']['type']);
    }

    public function test_a_taxonomy_field_type_decides_single_or_multiple(): void
    {
        $single = $this->field(['type' => 'taxonomy', 'field_type' => 'select']);
        $multi  = $this->field(['type' => 'taxonomy', 'field_type' => 'checkbox']);

        $this->assertSame('integer', $single['type']);
        $this->assertSame('array', $multi['type']);
        $this->assertSame('integer', $multi['items']['type']);
    }

    public function test_a_group_nests_its_sub_fields(): void
    {
        $schema = $this->field([
            'type'       => 'group',
            'sub_fields' => [
                ['name' => 'city', 'type' => 'text'],
                ['name' => 'floor', 'type' => 'number'],
            ],
        ]);

        $this->assertSame('object', $schema['type']);
        $this->assertSame(['city', 'floor'], array_keys($schema['properties']));
        $this->assertSame('string', $schema['properties']['city']['type']);
    }

    public function test_a_repeater_maps_to_an_array_of_objects(): void
    {
        $schema = $this->field([
            'type'       => 'repeater',
            'sub_fields' => [['name' => 'title', 'type' => 'text']],
        ]);

        $this->assertSame('array', $schema['type']);
        $this->assertSame('object', $schema['items']['type']);
        $this->assertSame(['title'], array_keys($schema['items']['properties']));
    }

    public function test_a_group_nested_in_a_repeater_recurses(): void
    {
        $schema = $this->field([
            'type'       => 'repeater',
            'sub_fields' => [[
                'name'       => 'address',
                'type'       => 'group',
                'sub_fields' => [['name' => 'city', 'type' => 'text']],
            ]],
        ]);

        $this->assertSame(
            'string',
            $schema['items']['properties']['address']['properties']['city']['type'],
        );
    }

    public function test_an_unknown_type_falls_back_to_a_permissive_schema(): void
    {
        $schema = $this->field(['type' => 'flexible_content']);

        $this->assertArrayNotHasKey('type', $schema, 'A field with no type constrains nothing.');
        $this->assertArrayHasKey('description', $schema);
        $this->assertTrue($schema['required']);
    }

    public function test_every_field_is_marked_present(): void
    {
        $this->assertTrue($this->field(['type' => 'text'])['required']);
        $this->assertTrue($this->field(['type' => 'image'])['required']);
    }

    public function test_label_and_instructions_document_the_property(): void
    {
        $schema = $this->field(['type' => 'text', 'label' => 'Company', 'instructions' => 'The trading name.']);

        $this->assertSame('Company', $schema['title']);
        $this->assertSame('The trading name.', $schema['description']);
    }

    /**
     * A field's schema with the presence and documentation keys stripped, so a
     * format assertion reads as the two keys it is about.
     *
     * @param array<string, mixed> $definition
     * @return array<string, mixed>
     */
    private function plain(array $definition): array
    {
        $schema = $this->field($definition);
        unset($schema['required'], $schema['title'], $schema['description']);

        return $schema;
    }
}
