<?php

namespace Kizlo\Modules\CustomFields;

/**
 * Normalizes raw custom-field definition input into the stored shape.
 *
 * Every definition keeps a permanent generated `field_*` key and a meta-key
 * `name` that locks to its first-saved value (matched by key against the
 * previous definitions), so the generated `kcf_*` keys stay stable across edits.
 */
class FieldDefinitions
{
    public const TYPES = [
        'text',
        'textarea',
        'richtext',
        'number',
        'toggle',
        'select',
        'multiselect',
        'url',
        'email',
        'date',
        'image',
        'file',
        'group',
        'repeater',
    ];

    /** Field types that recursively contain child definitions. */
    public const CONTAINER_TYPES = ['group', 'repeater'];

    /**
     * Normalize a raw, ordered definition list. Invalid entries are dropped.
     *
     * @param mixed                     $raw      Raw definitions from request input.
     * @param array<int, array<mixed>>  $previous Previously stored definitions, for name-locking.
     * @return array<int, array<string, mixed>>
     */
    public static function normalize(mixed $raw, array $previous = []): array
    {
        if (!is_array($raw)) {
            return [];
        }

        $previous_by_key = self::indexByKey($previous);

        $result = [];
        foreach ($raw as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $type = $entry['type'] ?? null;
            if (!is_string($type) || !in_array($type, self::TYPES, true)) {
                continue;
            }

            $key  = self::normalizeKey($entry['key'] ?? null);
            $prev = $previous_by_key[$key] ?? null;

            // The name locks to its first-saved value once the definition exists.
            $name = isset($prev['name'])
                ? (string) $prev['name']
                : self::normalizeName($entry['name'] ?? '');

            if ($name === '') {
                continue;
            }

            $definition = [
                'key'          => $key,
                'name'         => $name,
                'label'        => sanitize_text_field((string) ($entry['label'] ?? '')),
                'instructions' => sanitize_text_field((string) ($entry['instructions'] ?? '')),
                'required'     => !empty($entry['required']),
                'type'         => $type,
            ];

            $prev_children = is_array($prev['fields'] ?? null) ? $prev['fields'] : [];
            $result[] = array_merge($definition, self::normalizeConfig($type, $entry, $prev_children));
        }

        return $result;
    }

    /**
     * Type-specific configuration, including recursive children for containers.
     *
     * @param array<string, mixed>     $entry
     * @param array<int, array<mixed>> $prev_children
     * @return array<string, mixed>
     */
    private static function normalizeConfig(string $type, array $entry, array $prev_children): array
    {
        return match ($type) {
            'text', 'url', 'email', 'date' => [
                'default' => self::stringOrNull($entry['default'] ?? null),
            ],
            'textarea' => [
                'default' => self::textareaOrNull($entry['default'] ?? null),
            ],
            'richtext' => [
                'default' => isset($entry['default']) && $entry['default'] !== ''
                    ? wp_kses_post((string) $entry['default'])
                    : null,
            ],
            'number' => [
                'default' => self::numberOrNull($entry['default'] ?? null),
                'min'     => self::numberOrNull($entry['min'] ?? null),
                'max'     => self::numberOrNull($entry['max'] ?? null),
                'step'    => self::numberOrNull($entry['step'] ?? null),
            ],
            'toggle' => [
                'default' => !empty($entry['default']),
            ],
            'select' => [
                'choices' => self::normalizeChoices($entry['choices'] ?? null),
                'default' => self::stringOrNull($entry['default'] ?? null),
            ],
            'multiselect' => [
                'choices' => self::normalizeChoices($entry['choices'] ?? null),
                'default' => self::stringList($entry['default'] ?? null),
            ],
            'image', 'file' => [],
            'group' => [
                'fields' => self::normalize($entry['fields'] ?? [], $prev_children),
            ],
            'repeater' => [
                'fields' => self::normalize($entry['fields'] ?? [], $prev_children),
                'min'    => self::intOrNull($entry['min'] ?? null),
                'max'    => self::intOrNull($entry['max'] ?? null),
            ],
            default => [],
        };
    }

    /**
     * Index a definition list by its `field_*` key for previous-value lookups.
     *
     * @param array<int, array<mixed>> $definitions
     * @return array<string, array<mixed>>
     */
    private static function indexByKey(array $definitions): array
    {
        $index = [];
        foreach ($definitions as $definition) {
            if (!empty($definition['key'])) {
                $index[(string) $definition['key']] = $definition;
            }
        }
        return $index;
    }

    /** Keep a valid `field_*` key or mint a fresh one. */
    private static function normalizeKey(mixed $key): string
    {
        if (is_string($key) && preg_match('/^field_[a-z0-9]+$/', $key)) {
            return $key;
        }
        return 'field_' . substr(bin2hex(random_bytes(8)), 0, 13);
    }

    /** Reduce a name to a lowercase meta-key segment (`a-z 0-9 _`). */
    public static function normalizeName(mixed $name): string
    {
        $name = strtolower(trim((string) $name));
        $name = preg_replace('/[^a-z0-9_]+/', '_', $name) ?? '';
        return trim($name, '_');
    }

    private static function stringOrNull(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        return sanitize_text_field((string) $value);
    }

    private static function textareaOrNull(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        return sanitize_textarea_field((string) $value);
    }

    private static function numberOrNull(mixed $value): int|float|null
    {
        if ($value === null || $value === '' || !is_numeric($value)) {
            return null;
        }
        return $value + 0;
    }

    private static function intOrNull(mixed $value): ?int
    {
        if ($value === null || $value === '' || !is_numeric($value)) {
            return null;
        }

        if (filter_var($value, FILTER_VALIDATE_INT) === false) {
            throw new \InvalidArgumentException('Repeater row bounds must be whole numbers.');
        }
        return (int) $value;
    }

    /**
     * @return array<int, string>
     */
    private static function stringList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        return array_values(array_map(fn($item) => sanitize_text_field((string) $item), $value));
    }

    /**
     * @return array<int, array{value: string, label: string}>
     */
    private static function normalizeChoices(mixed $choices): array
    {
        if (!is_array($choices)) {
            return [];
        }

        $result = [];
        foreach ($choices as $choice) {
            if (!is_array($choice)) {
                continue;
            }
            $value = sanitize_text_field((string) ($choice['value'] ?? ''));
            $label = sanitize_text_field((string) ($choice['label'] ?? ''));
            $result[] = [
                'value' => $value,
                'label' => $label !== '' ? $label : $value,
            ];
        }
        return $result;
    }
}
