<?php

namespace Kizlo\Tests\CustomFields;

use InvalidArgumentException;
use Kizlo\Tests\TestCase;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\CustomFields\CustomFieldsValidator;

/**
 * The guard that rejects a whole settings update: duplicate sibling names, unsafe
 * type changes, and any generated `kcf_*` key that would breach the 255-character
 * WordPress meta_key limit (reserving ten digits for every unbounded repeater index).
 */
class CustomFieldsValidatorTest extends TestCase
{
    /**
     * @param array<int, array<string, mixed>> $raw
     * @param array<int, array<string, mixed>> $previous
     */
    private function assertRejected(array $raw, array $previous = []): void
    {
        $this->expectException(InvalidArgumentException::class);
        CustomFieldsValidator::assert(FieldDefinitions::normalize($raw, $previous), $previous);
    }

    public function test_accepts_a_valid_tree(): void
    {
        $defs = FieldDefinitions::normalize([
            ['type' => 'text', 'name' => 'company_name'],
            ['type' => 'repeater', 'name' => 'features', 'fields' => [['type' => 'text', 'name' => 'title']]],
        ]);

        CustomFieldsValidator::assert($defs);
        $this->assertTrue(true);
    }

    public function test_rejects_a_name_that_overflows_the_key_limit(): void
    {
        // '_kcf_' (5) + name must stay within 255, so a 251-char name overflows.
        $this->assertRejected([['type' => 'text', 'name' => str_repeat('a', 251)]]);
    }

    public function test_accepts_a_name_exactly_at_the_key_limit(): void
    {
        $defs = FieldDefinitions::normalize([['type' => 'text', 'name' => str_repeat('a', 250)]]);

        CustomFieldsValidator::assert($defs);
        $this->assertSame(255, strlen('_kcf_' . $defs[0]['name']));
    }

    public function test_reserves_ten_digits_for_unbounded_repeater_indexes(): void
    {
        // Parent 'r' + '_' + 10-digit index + '_' + child leaves no room for a long child name.
        // _kcf_ (5) + r_ (2) + 9999999999_ (11) = 18, so a 240-char child name overflows.
        $this->assertRejected([
            [
                'type'   => 'repeater',
                'name'   => 'r',
                'fields' => [['type' => 'text', 'name' => str_repeat('c', 240)]],
            ],
        ]);
    }

    public function test_bounded_repeater_reserves_fewer_index_digits(): void
    {
        // With max 10 rows, indexes are single/double digit, so the same child name fits.
        $defs = FieldDefinitions::normalize([
            [
                'type'   => 'repeater',
                'name'   => 'r',
                'max'    => 10,
                'fields' => [['type' => 'text', 'name' => str_repeat('c', 240)]],
            ],
        ]);

        CustomFieldsValidator::assert($defs);
        $this->assertTrue(true);
    }

    public function test_allows_names_used_by_core_response_properties(): void
    {
        $defs = FieldDefinitions::normalize([
            ['type' => 'text', 'name' => 'content'],
            ['type' => 'text', 'name' => 'taxonomy'],
            ['type' => 'text', 'name' => 'kizlo'],
        ]);

        CustomFieldsValidator::assert($defs);
        $this->assertSame(['content', 'taxonomy', 'kizlo'], array_column($defs, 'name'));
    }

    public function test_rejects_a_digit_leading_name(): void
    {
        // '123123' survives normalization but is only reachable via bracket access.
        $this->assertRejected([['type' => 'text', 'name' => '123123']]);
    }

    public function test_rejects_a_digit_leading_nested_name(): void
    {
        $this->assertRejected([
            ['type' => 'group', 'name' => 'details', 'fields' => [['type' => 'text', 'name' => '2col']]],
        ]);
    }

    public function test_accepts_digits_after_a_leading_letter(): void
    {
        $defs = FieldDefinitions::normalize([['type' => 'text', 'name' => 'address_line_1']]);

        CustomFieldsValidator::assert($defs);
        $this->assertSame('address_line_1', $defs[0]['name']);
    }

    public function test_rejects_duplicate_sibling_names(): void
    {
        $this->assertRejected([
            ['type' => 'text', 'name' => 'title'],
            ['type' => 'number', 'name' => 'title'],
        ]);
    }

    public function test_rejects_a_group_path_that_collides_with_a_flat_name(): void
    {
        $this->assertRejected([
            ['type' => 'text', 'name' => 'a_b'],
            ['type' => 'group', 'name' => 'a', 'fields' => [['type' => 'text', 'name' => 'b']]],
        ]);
    }

    public function test_rejects_a_repeater_path_that_collides_at_any_index(): void
    {
        $this->assertRejected([
            ['type' => 'text', 'name' => 'a_123_b'],
            ['type' => 'repeater', 'name' => 'a', 'fields' => [['type' => 'text', 'name' => 'b']]],
        ]);
    }

    public function test_rejects_overlapping_nested_repeater_patterns(): void
    {
        $this->assertRejected([
            ['type' => 'repeater', 'name' => 'a', 'fields' => [['type' => 'text', 'name' => 'b_0_c']]],
            ['type' => 'repeater', 'name' => 'a_0_b', 'fields' => [['type' => 'text', 'name' => 'c']]],
        ]);
    }

    /** @dataProvider invalidConfigurationProvider */
    public function test_rejects_invalid_field_configuration(array $raw): void
    {
        $this->assertRejected([$raw]);
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public function invalidConfigurationProvider(): array
    {
        return [
            'number min above max' => [['type' => 'number', 'name' => 'score', 'min' => 10, 'max' => 1]],
            'zero number step' => [['type' => 'number', 'name' => 'score', 'step' => 0]],
            'negative number step' => [['type' => 'number', 'name' => 'score', 'step' => -1]],
            'negative repeater min' => [['type' => 'repeater', 'name' => 'items', 'min' => -1, 'fields' => []]],
            'repeater min above max' => [['type' => 'repeater', 'name' => 'items', 'min' => 3, 'max' => 1, 'fields' => []]],
            'required repeater with zero max' => [['type' => 'repeater', 'name' => 'items', 'required' => true, 'max' => 0, 'fields' => []]],
            'required group without children' => [['type' => 'group', 'name' => 'details', 'required' => true, 'fields' => []]],
            'required select without choices' => [['type' => 'select', 'name' => 'plan', 'required' => true, 'choices' => []]],
            'empty choice value' => [['type' => 'select', 'name' => 'plan', 'choices' => [['value' => '', 'label' => 'Blank']]]],
            'duplicate choice value' => [[
                'type' => 'multiselect',
                'name' => 'plans',
                'choices' => [['value' => 'a', 'label' => 'A'], ['value' => 'a', 'label' => 'Again']],
            ]],
            'invalid email default' => [['type' => 'email', 'name' => 'contact', 'default' => 'invalid']],
            'invalid url default' => [['type' => 'url', 'name' => 'website', 'default' => 'invalid']],
            'impossible date default' => [['type' => 'date', 'name' => 'launch', 'default' => '2025-02-29']],
            'unknown select default' => [[
                'type' => 'select',
                'name' => 'plan',
                'choices' => [['value' => 'a', 'label' => 'A']],
                'default' => 'missing',
            ]],
            'unknown multiselect default' => [[
                'type' => 'multiselect',
                'name' => 'plans',
                'choices' => [['value' => 'a', 'label' => 'A']],
                'default' => ['a', 'missing'],
            ]],
            'duplicate multiselect defaults' => [[
                'type' => 'multiselect',
                'name' => 'plans',
                'choices' => [['value' => 'a', 'label' => 'A']],
                'default' => ['a', 'a'],
            ]],
            'number default below min' => [['type' => 'number', 'name' => 'score', 'default' => -1, 'min' => 0]],
            'number default off step' => [['type' => 'number', 'name' => 'score', 'default' => 3, 'min' => 0, 'step' => 2]],
        ];
    }

    public function test_allows_a_safe_type_change(): void
    {
        $previous = FieldDefinitions::normalize([['key' => 'field_a1', 'type' => 'text', 'name' => 'body']]);
        $next     = FieldDefinitions::normalize([['key' => 'field_a1', 'type' => 'richtext', 'name' => 'body']], $previous);

        CustomFieldsValidator::assert($next, $previous);
        $this->assertSame('richtext', $next[0]['type']);
    }

    public function test_allows_a_required_multiselect_without_a_default(): void
    {
        $definitions = FieldDefinitions::normalize([[
            'type'     => 'multiselect',
            'name'     => 'plans',
            'required' => true,
            'choices'  => [['value' => 'a', 'label' => 'A']],
            'default'  => [],
        ]]);

        CustomFieldsValidator::assert($definitions);
        $this->assertSame([], $definitions[0]['default']);
    }

    public function test_rejects_an_unsafe_type_change(): void
    {
        $previous = FieldDefinitions::normalize([['key' => 'field_a1', 'type' => 'text', 'name' => 'body']]);

        $this->expectException(InvalidArgumentException::class);
        CustomFieldsValidator::assert(
            FieldDefinitions::normalize([['key' => 'field_a1', 'type' => 'number', 'name' => 'body']], $previous),
            $previous
        );
    }
}
