<?php

namespace Kizlo\Modules\Introspection;

/**
 * Converts stored custom-field definitions into contract schemas.
 *
 * Input and output differ in three places, all of them real behaviour rather
 * than convention:
 *
 * - Media fields are written as an attachment ID and read back as a resolved
 *   {@see CoreSchemas::MEDIA} object, or null.
 * - A required field is required on create, but optional on a partial update:
 *   an update only validates the fields it actually carries, so an untouched
 *   required field stays as it was.
 * - Every field is present in a response. Reads walk the current definitions and
 *   emit a value for each, falling back to the definition's default.
 *
 * The stored definition keys are the editor's, not the contract's, so `min`,
 * `max`, `step` and `choices` map onto `minimum`, `maximum`, `multipleOf` and
 * `enum` on the way through.
 */
class CustomFieldSchema
{
    /**
     * @param array<int, array<string, mixed>> $definitions
     * @return array<string, array<string, mixed>>
     */
    public static function inputProperties(array $definitions, bool $partial): array
    {
        $properties = [];

        foreach ($definitions as $definition) {
            $name = (string) ($definition['name'] ?? '');

            if ($name === '') {
                continue;
            }

            $properties[$name] = self::input($definition, $partial);
        }

        return $properties;
    }

    /**
     * @param array<int, array<string, mixed>> $definitions
     * @return array<string, array<string, mixed>>
     */
    public static function responseProperties(array $definitions): array
    {
        $properties = [];

        foreach ($definitions as $definition) {
            $name = (string) ($definition['name'] ?? '');

            if ($name === '') {
                continue;
            }

            $properties[$name] = self::response($definition);
        }

        return $properties;
    }

    /**
     * @param array<string, mixed> $definition
     * @return array<string, mixed>
     */
    private static function input(array $definition, bool $partial): array
    {
        $type     = (string) $definition['type'];
        $required = !$partial && !empty($definition['required']);
        $children = is_array($definition['fields'] ?? null) ? $definition['fields'] : [];

        $schema = match ($type) {
            'text', 'textarea', 'richtext' => ['type' => 'string'],
            'url'         => ['type' => 'string', 'format' => 'uri'],
            'email'       => ['type' => 'string', 'format' => 'email'],
            'date'        => ['type' => 'string', 'format' => 'date', 'pattern' => '^\d{4}-\d{2}-\d{2}$'],
            'number'      => ['type' => 'number'] + self::numberConstraints($definition),
            'toggle'      => ['type' => 'boolean'],
            'select'      => ['type' => 'string', 'enum' => self::choices($definition)],
            'multiselect' => ['type' => 'array', 'items' => ['type' => 'string', 'enum' => self::choices($definition)]],
            'image', 'file' => ['type' => 'integer', 'description' => 'Attachment ID.'],
            'group'       => ['type' => 'object', 'properties' => self::inputProperties($children, false)],
            'repeater'    => [
                'type'  => 'array',
                'items' => ['type' => 'object', 'properties' => self::inputProperties($children, false)],
            ] + self::repeaterLimits($definition),
            default       => ['type' => 'string'],
        };

        if ($required) {
            $schema = self::required($schema);
        }

        if (isset($definition['default']) && $definition['default'] !== []) {
            $schema['default'] = $definition['default'];
        }

        return self::documented($schema, $definition);
    }

    /**
     * @param array<string, mixed> $definition
     * @return array<string, mixed>
     */
    private static function response(array $definition): array
    {
        $type     = (string) $definition['type'];
        $children = is_array($definition['fields'] ?? null) ? $definition['fields'] : [];

        if ($type === 'image' || $type === 'file') {
            return self::documented([
                '$ref'     => CoreSchemas::MEDIA,
                'required' => true,
                'nullable' => true,
            ], $definition, true);
        }

        $schema = match ($type) {
            'text', 'textarea', 'richtext' => ['type' => 'string'],
            'url'         => ['type' => 'string', 'format' => 'uri'],
            'email'       => ['type' => 'string', 'format' => 'email'],
            'date'        => ['type' => 'string', 'format' => 'date'],
            'number'      => ['type' => 'number', 'nullable' => true] + self::numberConstraints($definition),
            'toggle'      => ['type' => 'boolean'],
            'select'      => ['type' => 'string', 'enum' => self::responseChoices($definition)],
            'multiselect' => ['type' => 'array', 'items' => ['type' => 'string', 'enum' => self::choices($definition)]],
            'group'       => ['type' => 'object', 'properties' => self::responseProperties($children)],
            'repeater'    => [
                'type'  => 'array',
                'items' => ['type' => 'object', 'properties' => self::responseProperties($children)],
            ],
            default       => ['type' => 'string'],
        };

        return self::documented(self::required($schema), $definition);
    }

    /**
     * Mark a schema required without displacing `type`, which reads best first.
     *
     * @param array<string, mixed> $schema
     * @return array<string, mixed>
     */
    private static function required(array $schema): array
    {
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
     * A select that was never saved reads back as an empty string, so the empty
     * value belongs in the response enum unless a valid default guarantees one of
     * the choices.
     *
     * @param array<string, mixed> $definition
     * @return array<int, string>
     */
    private static function responseChoices(array $definition): array
    {
        $choices = self::choices($definition);
        $default = $definition['default'] ?? null;

        if (is_string($default) && in_array($default, $choices, true)) {
            return $choices;
        }

        return array_values(array_unique(array_merge($choices, [''])));
    }

    /**
     * @param array<string, mixed> $definition
     * @return array<int, string>
     */
    private static function choices(array $definition): array
    {
        $choices = is_array($definition['choices'] ?? null) ? $definition['choices'] : [];

        $values = [];
        foreach ($choices as $choice) {
            if (is_array($choice) && isset($choice['value'])) {
                $values[] = (string) $choice['value'];
            }
        }

        // An empty enum is not a valid constraint, and a select with no configured
        // choices accepts nothing but the empty value.
        return $values === [] ? [''] : $values;
    }

    /**
     * @param array<string, mixed> $definition
     * @return array<string, mixed>
     */
    private static function numberConstraints(array $definition): array
    {
        $constraints = [];

        foreach (['min' => 'minimum', 'max' => 'maximum', 'step' => 'multipleOf'] as $stored => $keyword) {
            $value = $definition[$stored] ?? null;

            if (is_int($value) || is_float($value)) {
                $constraints[$keyword] = $value;
            }
        }

        return $constraints;
    }

    /**
     * A required repeater, or one with a positive `min`, needs at least one row —
     * matching what {@see \Kizlo\Modules\CustomFields\CustomFieldsStore} enforces
     * on write.
     *
     * @param array<string, mixed> $definition
     * @return array<string, mixed>
     */
    private static function repeaterLimits(array $definition): array
    {
        $limits = [];

        $min = is_int($definition['min'] ?? null) ? $definition['min'] : null;
        $max = is_int($definition['max'] ?? null) ? $definition['max'] : null;

        if (!empty($definition['required']) || ($min !== null && $min > 0)) {
            $limits['minItems'] = max(1, (int) $min);
        } elseif ($min !== null) {
            $limits['minItems'] = $min;
        }

        if ($max !== null) {
            $limits['maxItems'] = $max;
        }

        return $limits;
    }

    /**
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $definition
     * @return array<string, mixed>
     */
    private static function documented(array $schema, array $definition, bool $descriptionOnly = false): array
    {
        $label        = (string) ($definition['label'] ?? '');
        $instructions = (string) ($definition['instructions'] ?? '');

        if ($label !== '' && !$descriptionOnly) {
            $schema['title'] = $label;
        }

        if ($instructions !== '') {
            $schema['description'] = $instructions;
        }

        return $schema;
    }
}
