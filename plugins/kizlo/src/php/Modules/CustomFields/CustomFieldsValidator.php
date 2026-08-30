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
        self::assertUniqueStoragePaths($definitions);
        self::assertConfigurations($definitions);
        self::assertSafeTypeChanges($definitions, self::flattenTypes($previous));
        self::assertKeyLengths($definitions, '', []);
    }

    /**
     * Reject definitions whose flattened WordPress meta keys can overlap. A
     * repeater index is represented as a numeric wildcard, so this catches both
     * direct group collisions (`a_b` vs `a > b`) and indexed repeater collisions
     * (`a_0_b` vs `a > row 0 > b`) at any nesting depth.
     *
     * @param array<int, array<string, mixed>> $definitions
     */
    private static function assertUniqueStoragePaths(array $definitions): void
    {
        $patterns = self::storagePatterns($definitions, [], []);

        for ($left = 0; $left < count($patterns); $left++) {
            for ($right = $left + 1; $right < count($patterns); $right++) {
                if (!self::patternsOverlap($patterns[$left]['tokens'], $patterns[$right]['tokens'])) {
                    continue;
                }

                throw new InvalidArgumentException(
                    'Custom field storage paths collide: "'
                    . implode(' › ', $patterns[$left]['trail'])
                    . '" and "'
                    . implode(' › ', $patterns[$right]['trail'])
                    . '" can write the same WordPress meta key. Rename one of the fields.'
                );
            }
        }
    }

    /**
     * @param array<int, array<string, mixed>> $definitions
     * @param array<int, string>               $prefix
     * @param array<int, string>               $trail
     * @return array<int, array{tokens: array<int, string>, trail: array<int, string>}>
     */
    private static function storagePatterns(array $definitions, array $prefix, array $trail): array
    {
        $patterns = [];
        foreach ($definitions as $definition) {
            $name       = (string) $definition['name'];
            $type       = (string) $definition['type'];
            $field      = array_merge($prefix, self::literalTokens($name));
            $fieldTrail = array_merge($trail, [$definition['label'] ?: $name]);

            if ($type !== 'group') {
                $patterns[] = ['tokens' => $field, 'trail' => $fieldTrail];
            }

            if ($type === 'group') {
                $patterns = array_merge(
                    $patterns,
                    self::storagePatterns($definition['fields'] ?? [], array_merge($field, ['_']), $fieldTrail)
                );
            } elseif ($type === 'repeater') {
                $patterns = array_merge(
                    $patterns,
                    self::storagePatterns($definition['fields'] ?? [], array_merge($field, ['_', '*', '_']), $fieldTrail)
                );
            }
        }
        return $patterns;
    }

    /** @return array<int, string> */
    private static function literalTokens(string $value): array
    {
        return str_split($value);
    }

    /**
     * Decide whether two token patterns have any concrete string in common.
     * `*` means one or more decimal digits. The product walk below is a small
     * NFA intersection, avoiding guesses about repeater indexes.
     *
     * @param array<int, string> $left
     * @param array<int, string> $right
     */
    private static function patternsOverlap(array $left, array $right): bool
    {
        $queue = [[[0, false], [0, false]]];
        $seen  = [];

        while ($queue !== []) {
            [$leftState, $rightState] = array_shift($queue);
            foreach (self::epsilonClosure($leftState, $left) as $closedLeft) {
                foreach (self::epsilonClosure($rightState, $right) as $closedRight) {
                    $key = implode(':', [(int) $closedLeft[0], (int) $closedLeft[1], (int) $closedRight[0], (int) $closedRight[1]]);
                    if (isset($seen[$key])) {
                        continue;
                    }
                    $seen[$key] = true;

                    if ($closedLeft[0] === count($left) && $closedRight[0] === count($right)) {
                        return true;
                    }

                    foreach (self::stateTransitions($closedLeft, $left) as [$leftLabel, $nextLeft]) {
                        foreach (self::stateTransitions($closedRight, $right) as [$rightLabel, $nextRight]) {
                            if (self::transitionLabelsOverlap($leftLabel, $rightLabel)) {
                                $queue[] = [$nextLeft, $nextRight];
                            }
                        }
                    }
                }
            }
        }
        return false;
    }

    /**
     * @param array{0: int, 1: bool} $state
     * @param array<int, string>      $tokens
     * @return array<int, array{0: int, 1: bool}>
     */
    private static function epsilonClosure(array $state, array $tokens): array
    {
        $states = [$state];
        if ($state[1] && ($tokens[$state[0]] ?? null) === '*') {
            $states[] = [$state[0] + 1, false];
        }
        return $states;
    }

    /**
     * @param array{0: int, 1: bool} $state
     * @param array<int, string>      $tokens
     * @return array<int, array{0: string, 1: array{0: int, 1: bool}}>
     */
    private static function stateTransitions(array $state, array $tokens): array
    {
        $token = $tokens[$state[0]] ?? null;
        if ($token === null) {
            return [];
        }
        if ($token === '*') {
            return [['digit', [$state[0], true]]];
        }
        return [[$token, [$state[0] + 1, false]]];
    }

    private static function transitionLabelsOverlap(string $left, string $right): bool
    {
        if ($left === 'digit') {
            return $right === 'digit' || ctype_digit($right);
        }
        if ($right === 'digit') {
            return ctype_digit($left);
        }
        return $left === $right;
    }

    /** @param array<int, array<string, mixed>> $definitions */
    private static function assertConfigurations(array $definitions): void
    {
        foreach ($definitions as $definition) {
            $type  = (string) $definition['type'];
            $label = (string) ($definition['label'] ?: $definition['name']);

            if ($type === 'number') {
                $min  = $definition['min'] ?? null;
                $max  = $definition['max'] ?? null;
                $step = $definition['step'] ?? null;
                if ($min !== null && $max !== null && $min > $max) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" has a minimum greater than its maximum.");
                }
                if ($step !== null && $step <= 0) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" must have a positive step.");
                }
            }

            if ($type === 'repeater') {
                $min = $definition['min'] ?? null;
                $max = $definition['max'] ?? null;
                if (($min !== null && $min < 0) || ($max !== null && $max < 0)) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" cannot have negative row bounds.");
                }
                if ($min !== null && $max !== null && $min > $max) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" has minimum rows greater than maximum rows.");
                }
                if (!empty($definition['required']) && $max === 0) {
                    throw new InvalidArgumentException("Required custom field \"{$label}\" must allow at least one row.");
                }
            }

            if ($type === 'group' && !empty($definition['required']) && empty($definition['fields'])) {
                throw new InvalidArgumentException("Required custom field \"{$label}\" needs at least one child field.");
            }

            if (in_array($type, ['select', 'multiselect'], true)) {
                self::assertChoices($definition, $label);
            }

            if (array_key_exists('default', $definition) && $definition['default'] !== null && $definition['default'] !== '') {
                // Required constrains editor content, not whether a definition must
                // preselect a default. Validate only the default's type constraints.
                $default_definition             = $definition;
                $default_definition['required'] = false;
                CustomFieldsStore::assertDefinitionValue($default_definition, $definition['default'], ["{$label} default"]);
            }

            if (in_array($type, FieldDefinitions::CONTAINER_TYPES, true)) {
                self::assertConfigurations($definition['fields'] ?? []);
            }
        }
    }

    private static function assertChoices(array $definition, string $label): void
    {
        $seen = [];
        foreach ($definition['choices'] ?? [] as $choice) {
            $value = (string) ($choice['value'] ?? '');
            if ($value === '') {
                throw new InvalidArgumentException("Custom field \"{$label}\" has a choice with an empty value.");
            }
            if (isset($seen[$value])) {
                throw new InvalidArgumentException("Custom field \"{$label}\" has duplicate choice value \"{$value}\".");
            }
            $seen[$value] = true;
        }
        if (!empty($definition['required']) && $seen === []) {
            throw new InvalidArgumentException("Required custom field \"{$label}\" needs at least one choice.");
        }

        if ($definition['type'] === 'multiselect') {
            $defaults = $definition['default'] ?? [];
            if (count($defaults) !== count(array_unique($defaults))) {
                throw new InvalidArgumentException("Custom field \"{$label}\" has duplicate default selections.");
            }
        }
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

    /** Final storage safeguard for callers writing previously saved definitions. */
    public static function assertStorageSafetyOnly(array $definitions): void
    {
        self::assertUniqueStoragePaths($definitions);
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
