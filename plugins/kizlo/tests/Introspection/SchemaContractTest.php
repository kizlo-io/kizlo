<?php

namespace Kizlo\Tests\Introspection;

/**
 * The Kizlo schema standard: which keywords exist, where each is legal, and what
 * a malformed one reports.
 */
class SchemaContractTest extends IntrospectionTestCase
{
    /**
     * @param array<string, mixed> $schema
     */
    private function register(array $schema): void
    {
        kizlo_register_spec_schema('acme.widget', $schema);
    }

    /**
     * @return array<int, array<string, string>>
     */
    private function widgetErrors(): array
    {
        return $this->errorsFor($this->errors(), 'schema_id', 'acme.widget');
    }

    /**
     * @return array<int, array<string, string>>
     */
    private function widgetWarnings(): array
    {
        return $this->errorsFor($this->warnings(), 'schema_id', 'acme.widget');
    }

    public function test_a_schema_must_declare_a_type_a_ref_or_a_union(): void
    {
        $this->register(['description' => 'Nothing but prose.']);

        $this->assertErrorContains($this->widgetErrors(), 'must declare a "type"');
    }

    public function test_an_unknown_type_is_rejected(): void
    {
        $this->register(['type' => 'tuple']);

        $this->assertErrorContains($this->widgetErrors(), 'Unknown type "tuple"');
    }

    public function test_an_unknown_keyword_is_rejected(): void
    {
        $this->register(['type' => 'object', 'properties' => [], 'notAKeyword' => []]);

        $this->assertErrorContains($this->widgetWarnings(), 'Unknown keyword "notAKeyword"');
    }

    public function test_a_keyword_outside_its_type_is_rejected(): void
    {
        $this->register([
            'type'       => 'object',
            'properties' => ['count' => ['type' => 'integer', 'minLength' => 2]],
        ]);

        $this->assertErrorContains($this->widgetWarnings(), '"minLength" means nothing on type "integer"');
    }

    public function test_required_is_only_valid_on_an_object_property(): void
    {
        $this->register(['type' => 'object', 'required' => true, 'properties' => []]);

        $this->assertErrorContains($this->widgetWarnings(), '"required" is only valid on an object property');
    }

    public function test_required_is_not_valid_on_an_array_items_schema(): void
    {
        $this->register([
            'type'  => 'array',
            'items' => ['type' => 'string', 'required' => true],
        ]);

        $this->assertErrorContains($this->widgetWarnings(), '"required" is only valid on an object property');
    }

    public function test_an_omitted_required_is_accepted_and_stays_omitted(): void
    {
        $this->register(['type' => 'object', 'properties' => ['name' => ['type' => 'string']]]);

        $this->assertArrayNotHasKey('required', $this->document()['schemas']['acme.widget']['properties']['name']);
    }

    public function test_required_and_nullable_must_be_booleans(): void
    {
        // 0/1 and yes/no/true/false are repaired by SchemaCoercer; anything else
        // could have meant either, so it is reported instead of guessed at.
        $this->register([
            'type'       => 'object',
            'properties' => ['name' => ['type' => 'string', 'required' => 'perhaps', 'nullable' => 'maybe']],
        ]);

        $errors = $this->widgetErrors();
        $this->assertErrorContains($errors, '"required" must be a boolean');
        $this->assertErrorContains($errors, '"nullable" must be a boolean');
    }

    public function test_an_empty_enum_is_rejected(): void
    {
        $this->register(['type' => 'object', 'properties' => ['size' => ['type' => 'string', 'enum' => []]]]);

        $this->assertErrorContains($this->widgetWarnings(), '"enum" must be a non-empty list');
    }

    public function test_an_enum_map_is_rejected(): void
    {
        $this->register([
            'type'       => 'object',
            'properties' => ['size' => ['type' => 'string', 'enum' => ['s' => 'Small']]],
        ]);

        $this->assertErrorContains($this->widgetWarnings(), '"enum" must be a list, not a map');
    }

    public function test_an_exclusive_bound_needs_its_paired_bound(): void
    {
        $this->register([
            'type'       => 'object',
            'properties' => ['count' => ['type' => 'integer', 'exclusiveMinimum' => true]],
        ]);

        $this->assertErrorContains($this->widgetWarnings(), '"exclusiveMinimum" requires "minimum"');
    }

    public function test_a_non_serializable_default_is_rejected(): void
    {
        $this->register([
            'type'       => 'object',
            'properties' => ['name' => ['type' => 'string', 'default' => static fn() => 'nope']],
        ]);

        $this->assertErrorContains($this->widgetWarnings(), '"default" must be JSON-serializable');
    }

    public function test_a_union_declares_either_any_of_or_one_of_but_not_both(): void
    {
        $this->register([
            'anyOf' => [['type' => 'string']],
            'oneOf' => [['type' => 'integer']],
        ]);

        $this->assertErrorContains($this->widgetErrors(), 'either "anyOf" or "oneOf"');
    }

    public function test_a_union_does_not_also_declare_a_type(): void
    {
        $this->register(['type' => 'string', 'anyOf' => [['type' => 'string']]]);

        $this->assertErrorContains($this->widgetWarnings(), 'A union schema does not also declare a "type"');
    }

    public function test_union_members_are_validated(): void
    {
        $this->register(['oneOf' => [['type' => 'string'], ['type' => 'sasquatch']]]);

        $this->assertErrorContains($this->widgetErrors(), 'Unknown type "sasquatch"');
    }

    public function test_a_valid_union_of_named_schemas_is_accepted(): void
    {
        kizlo_register_spec_schema('acme.square', ['type' => 'object', 'properties' => ['side' => ['type' => 'number']]]);
        kizlo_register_spec_schema('acme.circle', ['type' => 'object', 'properties' => ['radius' => ['type' => 'number']]]);
        $this->register(['oneOf' => [['$ref' => 'acme.square'], ['$ref' => 'acme.circle']]]);

        $this->assertSame(
            [['$ref' => 'acme.square'], ['$ref' => 'acme.circle']],
            $this->document()['schemas']['acme.widget']['oneOf'],
        );
    }

    public function test_the_file_type_is_rejected_outside_a_multipart_request_body(): void
    {
        $this->register(['type' => 'object', 'properties' => ['upload' => ['type' => 'file']]]);

        $this->assertErrorContains($this->widgetErrors(), 'only valid under a multipart/form-data request body');
    }

    public function test_runtime_callbacks_are_rejected_in_a_standalone_spec_schema(): void
    {
        $this->register([
            'type'       => 'object',
            'properties' => ['name' => ['type' => 'string', 'sanitize_callback' => 'absint']],
        ]);

        $this->assertErrorContains($this->widgetWarnings(), '"sanitize_callback" only runs on a runtime route input');
    }

    public function test_nested_object_and_array_schemas_are_validated(): void
    {
        $this->register([
            'type'       => 'object',
            'properties' => [
                'rows' => [
                    'type'  => 'array',
                    'items' => [
                        'type'       => 'object',
                        'properties' => ['label' => ['type' => 'strong']],
                    ],
                ],
            ],
        ]);

        $errors = $this->widgetErrors();

        $this->assertErrorContains($errors, 'Unknown type "strong"');
        $this->assertSame('properties.rows.items.properties.label', $errors[0]['data']['pointer']);
    }

    public function test_a_schema_id_must_be_vendor_qualified(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_spec_schema');

        kizlo_register_spec_schema('widget', ['type' => 'object', 'properties' => []]);

        $this->assertErrorContains($this->errors(), 'must be vendor-qualified');
    }

    public function test_additional_properties_must_be_a_boolean_or_a_schema(): void
    {
        $this->register(['type' => 'object', 'additionalProperties' => 'yes']);

        $this->assertErrorContains($this->widgetWarnings(), '"additionalProperties" must be a boolean or a schema');
    }

    public function test_pattern_properties_values_are_validated(): void
    {
        $this->register([
            'type'              => 'object',
            'patternProperties' => ['^x-' => ['type' => 'unknown']],
        ]);

        $this->assertErrorContains($this->widgetErrors(), 'Unknown type "unknown"');
    }
}
