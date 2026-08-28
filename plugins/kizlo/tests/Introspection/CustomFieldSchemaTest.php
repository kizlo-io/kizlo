<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\CustomFields\FieldDefinitions;

/**
 * Stored custom-field definitions turned into contract schemas.
 *
 * The definition keys are the editor's, not the contract's, and input and output
 * genuinely differ for media, requiredness and nullability — so every field type
 * is checked on both sides against what the store actually reads and writes.
 */
class CustomFieldSchemaTest extends IntrospectionTestCase
{
    /**
     * Configure `post` with these definitions and return the generated schemas.
     *
     * @param array<int, array<string, mixed>> $raw
     * @return array{item: array<string, mixed>, create: array<string, mixed>, update: array<string, mixed>, itemRoot: array<string, mixed>, createGroup: array<string, mixed>, updateGroup: array<string, mixed>}
     */
    private function generate(array $raw): array
    {
        $this->seedSettings(['post_types' => ['post' => ['custom_fields' => FieldDefinitions::normalize($raw)]]]);

        $schemas = $this->document()['schemas'];

        $item_root   = $schemas['post-types.post.item']['properties'];
        $create_root = $schemas['post-types.post.create-input']['properties'];
        $update_root = $schemas['post-types.post.update-input']['properties'];

        $item_group   = $item_root['kizlo']['properties']['custom'];
        $create_group = $create_root['custom'];
        $update_group = $update_root['custom'];

        return [
            'item'        => $item_group['properties'],
            'create'      => $create_group['properties'],
            'update'      => $update_group['properties'],
            'itemRoot'    => $item_root,
            'createGroup' => $create_group,
            'updateGroup' => $update_group,
        ];
    }

    public function test_custom_fields_are_grouped_inside_the_kizlo_response_envelope(): void
    {
        $schemas = $this->generate([['type' => 'text', 'name' => 'company_name', 'label' => 'Company']]);

        $this->assertArrayHasKey('company_name', $schemas['item']);
        $this->assertSame('string', $schemas['item']['company_name']['type']);
        $this->assertTrue($schemas['item']['company_name']['required'], 'Every definition is read back, so every one is present.');
        $this->assertSame('Company', $schemas['item']['company_name']['title']);
        $this->assertTrue($schemas['itemRoot']['kizlo']['properties']['custom']['required']);
        $this->assertArrayNotHasKey('company_name', $schemas['itemRoot']);
    }

    public function test_a_custom_field_may_share_a_name_with_a_wordpress_field(): void
    {
        $schemas = $this->generate([['type' => 'text', 'name' => 'slug']]);

        $this->assertArrayHasKey('description', $schemas['itemRoot']['slug']);
        $this->assertSame('string', $schemas['item']['slug']['type']);
    }

    public function test_text_types_map_to_strings(): void
    {
        $schemas = $this->generate([
            ['type' => 'text', 'name' => 'one'],
            ['type' => 'textarea', 'name' => 'two'],
            ['type' => 'richtext', 'name' => 'three'],
        ]);

        foreach (['one', 'two', 'three'] as $name) {
            $this->assertSame('string', $schemas['item'][$name]['type']);
            $this->assertSame('string', $schemas['create'][$name]['type']);
        }
    }

    public function test_formatted_strings_carry_their_format(): void
    {
        $schemas = $this->generate([
            ['type' => 'url', 'name' => 'site'],
            ['type' => 'email', 'name' => 'contact'],
            ['type' => 'date', 'name' => 'released'],
        ]);

        $this->assertSame('uri', $schemas['item']['site']['format']);
        $this->assertSame('email', $schemas['item']['contact']['format']);
        $this->assertSame('date', $schemas['item']['released']['format']);
        $this->assertSame('^\d{4}-\d{2}-\d{2}$', $schemas['create']['released']['pattern']);
    }

    public function test_a_number_reads_back_nullable_and_carries_its_constraints(): void
    {
        $schemas = $this->generate([
            ['type' => 'number', 'name' => 'rank', 'min' => 1, 'max' => 10, 'step' => 0.5],
        ]);

        $this->assertSame('number', $schemas['item']['rank']['type']);
        $this->assertTrue($schemas['item']['rank']['nullable'], 'An unset number reads back as null.');

        $this->assertSame(1, $schemas['create']['rank']['minimum']);
        $this->assertSame(10, $schemas['create']['rank']['maximum']);
        $this->assertSame(0.5, $schemas['create']['rank']['multipleOf']);
        $this->assertArrayNotHasKey('nullable', $schemas['create']['rank']);
    }

    public function test_a_toggle_maps_to_a_boolean_and_keeps_its_default(): void
    {
        $schemas = $this->generate([['type' => 'toggle', 'name' => 'featured', 'default' => true]]);

        $this->assertSame('boolean', $schemas['item']['featured']['type']);
        $this->assertTrue($schemas['create']['featured']['default']);
    }

    public function test_a_select_maps_choices_onto_an_enum(): void
    {
        $schemas = $this->generate([[
            'type'    => 'select',
            'name'    => 'size',
            'choices' => [['value' => 's', 'label' => 'Small'], ['value' => 'l', 'label' => 'Large']],
        ]]);

        $this->assertSame(['s', 'l'], $schemas['create']['size']['enum']);
    }

    public function test_a_select_without_a_valid_default_can_read_back_empty(): void
    {
        $schemas = $this->generate([[
            'type'    => 'select',
            'name'    => 'size',
            'choices' => [['value' => 's', 'label' => 'Small']],
        ]]);

        $this->assertSame(['s', ''], $schemas['item']['size']['enum'], 'An unsaved select reads back as an empty string.');
    }

    public function test_a_select_with_a_valid_default_never_reads_back_empty(): void
    {
        $schemas = $this->generate([[
            'type'    => 'select',
            'name'    => 'size',
            'default' => 's',
            'choices' => [['value' => 's', 'label' => 'Small']],
        ]]);

        $this->assertSame(['s'], $schemas['item']['size']['enum']);
    }

    public function test_a_multiselect_maps_to_an_array_of_enum_values(): void
    {
        $schemas = $this->generate([[
            'type'    => 'multiselect',
            'name'    => 'materials',
            'choices' => [['value' => 'a', 'label' => 'A'], ['value' => 'b', 'label' => 'B']],
        ]]);

        $this->assertSame('array', $schemas['item']['materials']['type']);
        $this->assertSame(['a', 'b'], $schemas['item']['materials']['items']['enum']);
        $this->assertSame(['a', 'b'], $schemas['create']['materials']['items']['enum']);
    }

    public function test_media_is_written_as_an_id_and_read_back_as_resolved_media(): void
    {
        $schemas = $this->generate([
            ['type' => 'image', 'name' => 'cover'],
            ['type' => 'file', 'name' => 'manual'],
        ]);

        foreach (['cover', 'manual'] as $name) {
            $this->assertSame('integer', $schemas['create'][$name]['type']);
        }

        $this->assertSame(
            ['$ref' => 'kizlo.media-image', 'required' => true, 'nullable' => true],
            $schemas['item']['cover'],
        );
        $this->assertSame(
            ['$ref' => 'kizlo.media', 'required' => true, 'nullable' => true],
            $schemas['item']['manual'],
        );
    }

    public function test_a_group_nests_its_children_on_both_sides(): void
    {
        $schemas = $this->generate([[
            'type'   => 'group',
            'name'   => 'address',
            'fields' => [
                ['type' => 'text', 'name' => 'city', 'required' => true],
                ['type' => 'number', 'name' => 'floor'],
            ],
        ]]);

        $this->assertSame('object', $schemas['item']['address']['type']);
        $this->assertSame(['city', 'floor'], array_keys($schemas['item']['address']['properties']));
        $this->assertTrue($schemas['create']['address']['properties']['city']['required']);
        $this->assertTrue($schemas['item']['address']['properties']['floor']['nullable']);
    }

    public function test_a_group_nested_inside_a_group_recurses(): void
    {
        $schemas = $this->generate([[
            'type'   => 'group',
            'name'   => 'outer',
            'fields' => [[
                'type'   => 'group',
                'name'   => 'inner',
                'fields' => [['type' => 'text', 'name' => 'deep']],
            ]],
        ]]);

        $this->assertSame(
            'string',
            $schemas['item']['outer']['properties']['inner']['properties']['deep']['type'],
        );
    }

    public function test_a_repeater_maps_to_an_array_of_objects(): void
    {
        $schemas = $this->generate([[
            'type'   => 'repeater',
            'name'   => 'features',
            'fields' => [['type' => 'text', 'name' => 'title']],
        ]]);

        $this->assertSame('array', $schemas['item']['features']['type']);
        $this->assertSame('object', $schemas['item']['features']['items']['type']);
        $this->assertSame(['title'], array_keys($schemas['item']['features']['items']['properties']));
    }

    public function test_repeater_limits_map_onto_item_counts(): void
    {
        $schemas = $this->generate([[
            'type'   => 'repeater',
            'name'   => 'features',
            'min'    => 2,
            'max'    => 5,
            'fields' => [['type' => 'text', 'name' => 'title']],
        ]]);

        $this->assertSame(2, $schemas['create']['features']['minItems']);
        $this->assertSame(5, $schemas['create']['features']['maxItems']);
    }

    public function test_a_required_repeater_needs_at_least_one_row(): void
    {
        $schemas = $this->generate([[
            'type'     => 'repeater',
            'name'     => 'features',
            'required' => true,
            'fields'   => [['type' => 'text', 'name' => 'title']],
        ]]);

        $this->assertSame(1, $schemas['create']['features']['minItems']);
    }

    public function test_a_required_field_is_required_on_create_and_optional_on_update(): void
    {
        $schemas = $this->generate([['type' => 'text', 'name' => 'company_name', 'required' => true]]);

        $this->assertTrue($schemas['create']['company_name']['required']);
        $this->assertArrayNotHasKey('required', $schemas['update']['company_name']);
        $this->assertTrue($schemas['createGroup']['required'], 'The create group must be present when it contains a required field.');
        $this->assertArrayNotHasKey('required', $schemas['updateGroup']);
    }

    public function test_a_nested_required_field_stays_required_on_a_partial_update(): void
    {
        // A partial update only validates the fields it carries, but once a group
        // is submitted every child in it is validated again.
        $schemas = $this->generate([[
            'type'   => 'group',
            'name'   => 'address',
            'fields' => [['type' => 'text', 'name' => 'city', 'required' => true]],
        ]]);

        $this->assertArrayNotHasKey('required', $schemas['update']['address']);
        $this->assertTrue($schemas['update']['address']['properties']['city']['required']);
    }

    public function test_instructions_become_the_description(): void
    {
        $schemas = $this->generate([[
            'type'         => 'text',
            'name'         => 'company_name',
            'instructions' => 'The trading name.',
        ]]);

        $this->assertSame('The trading name.', $schemas['item']['company_name']['description']);
        $this->assertSame('The trading name.', $schemas['create']['company_name']['description']);
    }

    public function test_taxonomy_custom_fields_are_generated_the_same_way(): void
    {
        $this->seedSettings([
            'taxonomies' => [
                'category' => ['custom_fields' => FieldDefinitions::normalize([['type' => 'image', 'name' => 'banner']])],
            ],
        ]);

        $schemas = $this->document()['schemas'];

        $this->assertSame('integer', $schemas['taxonomies.category.create-input']['properties']['custom']['properties']['banner']['type']);
        $this->assertSame(
            'kizlo.media-image',
            $schemas['taxonomies.category.item']['properties']['kizlo']['properties']['custom']['properties']['banner']['$ref'],
        );
    }

    public function test_no_definitions_still_publish_a_required_empty_response_group(): void
    {
        $schemas = $this->generate([]);

        $this->assertEquals((object) [], $schemas['item']);
        $this->assertTrue($schemas['itemRoot']['kizlo']['properties']['custom']['required']);
        $this->assertArrayNotHasKey('required', $schemas['createGroup']);
    }
}
