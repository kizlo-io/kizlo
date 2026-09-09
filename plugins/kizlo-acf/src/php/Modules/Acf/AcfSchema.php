<?php

namespace Kizlo\Acf\Modules\Acf;

use Kizlo\Modules\Introspection\CoreSchemas;

/**
 * Maps an object's ACF field definitions to the typed `acf` sub-object Kizlo
 * publishes under `kizlo.custom`.
 *
 * The mapper is pure: it reads the field arrays ACF hands back from
 * `acf_get_fields()` and returns schema arrays, touching no WordPress state. The
 * media cases borrow {@see CustomFieldSchema}'s convention so an ACF image reads
 * back as the same resolved Kizlo media object a configured image field does;
 * {@see AcfValues} resolves the runtime values to match.
 *
 * An unmapped ACF type falls back to a permissive schema rather than a guess, so
 * a field type this mapper has never seen widens the contract instead of breaking
 * it.
 */
class AcfSchema
{
    /**
     * The `acf` property: an object with one typed property per field.
     *
     * @param array<int, array<string, mixed>> $fields Flat field definitions across the object's groups.
     * @return array<string, mixed>
     */
    public static function responseGroup(array $fields): array
    {
        return [
            'type'        => 'object',
            'required'    => true,
            'description' => 'Advanced Custom Fields values, keyed by field name.',
            'properties'  => self::properties($fields),
        ];
    }

    /**
     * @param array<int, array<string, mixed>> $fields
     * @return array<string, array<string, mixed>>
     */
    private static function properties(array $fields): array
    {
        $properties = [];

        foreach ($fields as $field) {
            $name = (string) ($field['name'] ?? '');

            if ($name === '') {
                continue;
            }

            $properties[$name] = self::field($field);
        }

        return $properties;
    }

    /**
     * @param array<string, mixed> $field
     * @return array<string, mixed>
     */
    private static function field(array $field): array
    {
        $type = (string) ($field['type'] ?? '');

        $schema = match ($type) {
            'text', 'textarea', 'wysiwyg', 'password', 'oembed' => ['type' => 'string'],
            'email'            => ['type' => 'string', 'format' => 'email'],
            'url', 'link'      => ['type' => 'string', 'format' => 'uri'],
            'number', 'range'  => ['type' => 'number', 'nullable' => true],
            'true_false'       => ['type' => 'boolean'],
            'select'           => self::choiceSchema($field, (bool) ($field['multiple'] ?? false)),
            'radio', 'button_group' => self::choiceSchema($field, false),
            'checkbox'         => self::choiceSchema($field, true),
            'date_picker'      => ['type' => 'string', 'format' => 'date'],
            'date_time_picker' => ['type' => 'string', 'format' => 'date-time'],
            'time_picker'      => ['type' => 'string', 'format' => 'time'],
            'color_picker'     => ['type' => 'string'],
            'image'            => ['$ref' => CoreSchemas::MEDIA_IMAGE, 'nullable' => true],
            'file'             => ['$ref' => CoreSchemas::MEDIA, 'nullable' => true],
            'gallery'          => ['type' => 'array', 'items' => ['$ref' => CoreSchemas::MEDIA_IMAGE]],
            'post_object', 'user' => self::relationSchema((bool) ($field['multiple'] ?? false)),
            'page_link'        => self::relationSchema((bool) ($field['multiple'] ?? false)),
            'relationship'     => ['type' => 'array', 'items' => ['type' => 'integer']],
            'taxonomy'         => self::relationSchema(self::taxonomyIsMultiple($field)),
            'group'            => ['type' => 'object', 'properties' => self::subProperties($field)],
            'repeater'         => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => self::subProperties($field)]],
            default            => self::fallback($type),
        };

        return self::documented(self::present($schema), $field);
    }

    /**
     * A single- or multi-value choice field. The stored value is the choice key,
     * so the enum is the keys of ACF's `choices` map. A choice field with no
     * configured choices carries no enum, because an empty enum accepts nothing.
     *
     * @param array<string, mixed> $field
     * @return array<string, mixed>
     */
    private static function choiceSchema(array $field, bool $multiple): array
    {
        $choices = self::choices($field);
        $item    = $choices === [] ? ['type' => 'string'] : ['type' => 'string', 'enum' => $choices];

        return $multiple ? ['type' => 'array', 'items' => $item] : $item;
    }

    /**
     * A reference to another object, stored as its ID.
     *
     * @return array<string, mixed>
     */
    private static function relationSchema(bool $multiple): array
    {
        return $multiple
            ? ['type' => 'array', 'items' => ['type' => 'integer']]
            : ['type' => 'integer', 'nullable' => true];
    }

    /**
     * ACF's taxonomy field stores multiple terms when its `field_type` is a
     * multi-select or checkbox control, and a single term otherwise.
     *
     * @param array<string, mixed> $field
     */
    private static function taxonomyIsMultiple(array $field): bool
    {
        return in_array((string) ($field['field_type'] ?? ''), ['multi_select', 'checkbox'], true);
    }

    /**
     * @param array<string, mixed> $field
     * @return array<string, array<string, mixed>>
     */
    private static function subProperties(array $field): array
    {
        $sub = is_array($field['sub_fields'] ?? null) ? $field['sub_fields'] : [];

        return self::properties($sub);
    }

    /**
     * The enum for a choice field: the keys of its `choices` map, as strings.
     *
     * @param array<string, mixed> $field
     * @return array<int, string>
     */
    private static function choices(array $field): array
    {
        $choices = is_array($field['choices'] ?? null) ? $field['choices'] : [];

        return array_map('strval', array_keys($choices));
    }

    /**
     * A field type this mapper does not know. An empty schema constrains nothing,
     * so the value passes through and a future ACF type never invalidates the
     * contract.
     *
     * @return array<string, mixed>
     */
    private static function fallback(string $type): array
    {
        return ['description' => sprintf('Unmapped ACF field type "%s".', $type)];
    }

    /**
     * Every field is emitted in a response, so its property is always present.
     * Mirrors {@see CustomFieldSchema}, which marks each resolved value required.
     *
     * @param array<string, mixed> $schema
     * @return array<string, mixed>
     */
    private static function present(array $schema): array
    {
        if (isset($schema['required'])) {
            return $schema;
        }

        if (!isset($schema['type'])) {
            return ['required' => true] + $schema;
        }

        $ordered = [];
        foreach ($schema as $keyword => $value) {
            $ordered[$keyword] = $value;

            if ($keyword === 'type') {
                $ordered['required'] = true;
            }
        }

        return $ordered;
    }

    /**
     * Carry the field's label and instructions onto the schema, matching how a
     * configured Kizlo field documents its own property.
     *
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $field
     * @return array<string, mixed>
     */
    private static function documented(array $schema, array $field): array
    {
        $label        = (string) ($field['label'] ?? '');
        $instructions = (string) ($field['instructions'] ?? '');

        if ($label !== '') {
            $schema['title'] = $label;
        }

        if ($instructions !== '') {
            $schema['description'] = $instructions;
        }

        return $schema;
    }
}
