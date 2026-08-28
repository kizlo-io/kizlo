<?php

namespace Kizlo\Modules\CustomFields;

use InvalidArgumentException;

/**
 * Guards a normalized definition tree before it is persisted or written.
 *
 * Rejects the whole update (by throwing) when sibling names collide, when an
 * existing field changes type outside the safe set, or when any generated
 * `kcf_*` / `_kcf_*` key would exceed WordPress's 255-character meta_key limit.
 */
class CustomFieldsValidator
{
    /** WordPress `meta_key` column length. */
    public const MAX_KEY_LENGTH = 255;

    /**
     * A field name must be a valid identifier: a leading lowercase letter followed by
     * lowercase letters, digits, or underscores. An all-digit or digit-leading
     * name (e.g. `123123`) would only be reachable via bracket access and is
     * invalid as a GraphQL field name.
     */
    private const NAME_PATTERN = '/^[a-z][a-z0-9_]*$/';

    /** Digits reserved for an unbounded repeater index (9999999999). */
    private const UNBOUNDED_INDEX_DIGITS = 10;

    /**
     * Type changes allowed on an existing field. Any other change requires
     * deleting and recreating the definition.
     *
     * @var array<int, array<int, string>>
     */
    private const SAFE_TYPE_GROUPS = [
        ['text', 'textarea', 'richtext'],
        ['select', 'multiselect'],
        ['image', 'file'],
    ];

    /**
     * @param array<int, array<string, mixed>> $definitions Normalized definitions.
     * @param array<int, array<string, mixed>> $previous    Previously stored definitions.
     * @throws InvalidArgumentException
     */
    public static function assert(array $definitions, array $previous = []): void
    {
        self::assertValidNames($definitions);
        self::assertUniqueNames($definitions);
        self::assertSafeTypeChanges($definitions, self::flattenTypes($previous));
        self::assertKeyLengths($definitions, '', []);
    }

    /**
     * Reject any field (at any level) whose name is not a valid identifier.
     * Normalization already reduces a name to `[a-z0-9_]` and drops empties, so the
     * remaining bad case this catches is a digit-leading name like `123123`.
     *
     * @param array<int, array<string, mixed>> $definitions
     * @throws InvalidArgumentException
     */
    private static function assertValidNames(array $definitions): void
    {
        foreach ($definitions as $definition) {
            $name = (string) $definition['name'];
            if (!preg_match(self::NAME_PATTERN, $name)) {
                $label = $definition['label'] !== '' ? $definition['label'] : $name;
                throw new InvalidArgumentException(
                    "Custom field \"{$label}\" has an invalid name \"{$name}\". Names must start with a letter and use "
                    . "only lowercase letters, numbers, and underscores."
                );
            }

            if (in_array($definition['type'], FieldDefinitions::CONTAINER_TYPES, true)) {
                self::assertValidNames($definition['fields'] ?? []);
            }
        }
    }

    /**
     * Standalone key-length assertion, used as a final safeguard before content writes.
     *
     * @param array<int, array<string, mixed>> $definitions Normalized definitions.
     * @throws InvalidArgumentException
     */
    public static function assertKeyLengthsOnly(array $definitions): void
    {
        self::assertKeyLengths($definitions, '', []);
    }

    /**
     * @param array<int, array<string, mixed>> $definitions
     */
    private static function assertUniqueNames(array $definitions): void
    {
        $seen = [];
        foreach ($definitions as $definition) {
            $name = (string) $definition['name'];
            if (isset($seen[$name])) {
                throw new InvalidArgumentException(
                    "Duplicate custom field name \"{$name}\". Field names must be unique within the same level."
                );
            }
            $seen[$name] = true;

            if (in_array($definition['type'], FieldDefinitions::CONTAINER_TYPES, true)) {
                self::assertUniqueNames($definition['fields'] ?? []);
            }
        }
    }

    /**
     * @param array<int, array<string, mixed>> $definitions
     * @param array<string, string>            $previous_types Field key => stored type.
     */
    private static function assertSafeTypeChanges(array $definitions, array $previous_types): void
    {
        foreach ($definitions as $definition) {
            $key      = (string) $definition['key'];
            $new_type = (string) $definition['type'];
            $old_type = $previous_types[$key] ?? null;

            if ($old_type !== null && $old_type !== $new_type && !self::isSafeTypeChange($old_type, $new_type)) {
                $label = $definition['label'] !== '' ? $definition['label'] : $definition['name'];
                throw new InvalidArgumentException(
                    "Custom field \"{$label}\" cannot change type from {$old_type} to {$new_type}. Delete and recreate the field instead."
                );
            }

            if (in_array($new_type, FieldDefinitions::CONTAINER_TYPES, true)) {
                self::assertSafeTypeChanges($definition['fields'] ?? [], $previous_types);
            }
        }
    }

    /**
     * Recursively assert every generated key stays within the length limit.
     * The `_kcf_` reference key is the longest of the pair, so it bounds both.
     *
     * @param array<int, array<string, mixed>> $definitions
     * @param string                           $prefix      Name path without the `kcf_` prefix.
     * @param array<int, string>               $label_trail Human labels for error reporting.
     */
    private static function assertKeyLengths(array $definitions, string $prefix, array $label_trail): void
    {
        foreach ($definitions as $definition) {
            $name      = (string) $definition['name'];
            $type      = (string) $definition['type'];
            $full_name = $prefix === '' ? $name : "{$prefix}_{$name}";
            $label     = $definition['label'] !== '' ? $definition['label'] : $name;
            $trail     = array_merge($label_trail, [$label]);

            // Groups carry no meta of their own; only their children generate keys.
            if ($type !== 'group') {
                $length = strlen('_kcf_' . $full_name);
                if ($length > self::MAX_KEY_LENGTH) {
                    $path = implode(' › ', $trail);
                    throw new InvalidArgumentException(
                        "Custom field \"{$label}\" (path: {$path}) generates a meta key of {$length} characters, "
                        . "exceeding the " . self::MAX_KEY_LENGTH . "-character WordPress limit. Shorten the field names in this path."
                    );
                }
            }

            if ($type === 'group') {
                self::assertKeyLengths($definition['fields'] ?? [], $full_name, $trail);
            } elseif ($type === 'repeater') {
                $index = str_repeat('9', self::repeaterIndexDigits($definition));
                self::assertKeyLengths($definition['fields'] ?? [], "{$full_name}_{$index}", $trail);
            }
        }
    }

    /** Worst-case index digit count for a repeater (10 when unbounded). */
    private static function repeaterIndexDigits(array $definition): int
    {
        $max = $definition['max'] ?? null;
        if ($max === null || (int) $max < 1) {
            return self::UNBOUNDED_INDEX_DIGITS;
        }
        return strlen((string) ((int) $max - 1));
    }

    private static function isSafeTypeChange(string $old, string $new): bool
    {
        foreach (self::SAFE_TYPE_GROUPS as $group) {
            if (in_array($old, $group, true) && in_array($new, $group, true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Flatten a definition tree into a field-key => type map (keys are globally unique).
     *
     * @param array<int, array<string, mixed>> $definitions
     * @return array<string, string>
     */
    private static function flattenTypes(array $definitions): array
    {
        $types = [];
        foreach ($definitions as $definition) {
            if (empty($definition['key']) || empty($definition['type'])) {
                continue;
            }
            $types[(string) $definition['key']] = (string) $definition['type'];
            if (in_array($definition['type'], FieldDefinitions::CONTAINER_TYPES, true)) {
                $types += self::flattenTypes($definition['fields'] ?? []);
            }
        }
        return $types;
    }
}
