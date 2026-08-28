<?php

namespace Kizlo\Modules\CustomFields;

use InvalidArgumentException;

/**
 * Reads and writes ACF-style custom-field values as `kcf_*` post/term meta.
 *
 * Values are stored under readable, name-derived keys (`kcf_company_name`) with a
 * hidden `_kcf_*` reference pointing at the definition's `field_*` key. Repeaters
 * store a row count on the parent and flatten indexed children
 * (`kcf_features_0_title`); shrinking or reordering rows reindexes and cleans up
 * obsolete rows. Reads walk only the current definitions, so values left behind by
 * deleted definitions stay orphaned and never appear in output.
 */
class CustomFieldsStore
{
    public const META_POST = 'post';
    public const META_TERM = 'term';

    private const VALUE_PREFIX = 'kcf_';
    private const REF_PREFIX   = '_kcf_';

    /**
     * Resolve stored values into the nested `custom` output shape.
     *
     * @param array<int, array<string, mixed>> $definitions Normalized definitions.
     * @return array<string, mixed>
     */
    public static function read(string $meta_type, int $object_id, array $definitions): array
    {
        $existing = self::allMeta($meta_type, $object_id);

        $out = [];
        foreach ($definitions as $definition) {
            $out[$definition['name']] = self::readField($definition, '', $existing);
        }
        return $out;
    }

    /**
     * Persist nested input values as flattened meta, validating first so a bad
     * write never leaves a partial update behind.
     *
     * @param array<int, array<string, mixed>> $definitions Normalized definitions.
     * @param array<string, mixed>             $values      Nested input values.
     * @throws InvalidArgumentException
     */
    public static function write(string $meta_type, int $object_id, array $definitions, array $values): void
    {
        self::assertWritable($definitions, $values);

        $existing = self::allMeta($meta_type, $object_id);

        $ops = [];
        foreach ($definitions as $definition) {
            self::writeField($definition, '', $values[$definition['name']] ?? null, $existing, $ops);
        }

        foreach ($ops as [$action, $key, $value]) {
            if ($action === 'set') {
                self::updateMeta($meta_type, $object_id, $key, $value);
            } else {
                self::deleteMeta($meta_type, $object_id, $key);
            }
        }
    }

    // ============================================================
    // READ
    // ============================================================

    /**
     * @param array<string, mixed> $existing key => single stored value.
     */
    private static function readField(array $definition, string $prefix, array $existing): mixed
    {
        $type = $definition['type'];
        $full = self::fullName($prefix, $definition['name']);

        if ($type === 'group') {
            $group = [];
            foreach ($definition['fields'] as $child) {
                $group[$child['name']] = self::readField($child, $full, $existing);
            }
            return $group;
        }

        if ($type === 'repeater') {
            $count = (int) ($existing[self::VALUE_PREFIX . $full] ?? 0);
            $rows  = [];
            for ($i = 0; $i < $count; $i++) {
                $row = [];
                foreach ($definition['fields'] as $child) {
                    $row[$child['name']] = self::readField($child, "{$full}_{$i}", $existing);
                }
                $rows[] = $row;
            }
            return $rows;
        }

        $key = self::VALUE_PREFIX . $full;
        return array_key_exists($key, $existing)
            ? self::resolveValue($definition, $existing[$key])
            : self::defaultValue($definition);
    }

    private static function resolveValue(array $definition, mixed $raw): mixed
    {
        return match ($definition['type']) {
            'image'         => ((int) $raw) > 0 ? kizlo_ensure_media_image_data((int) $raw) : null,
            'file'          => ((int) $raw) > 0 ? kizlo_ensure_media_data((int) $raw) : null,
            'number'        => is_numeric($raw) ? $raw + 0 : self::defaultValue($definition),
            'toggle'        => (string) $raw === '1',
            'multiselect'   => is_array($raw) ? array_values($raw) : ($raw === '' ? [] : [(string) $raw]),
            default         => (string) $raw,
        };
    }

    private static function defaultValue(array $definition): mixed
    {
        return match ($definition['type']) {
            'toggle'      => (bool) ($definition['default'] ?? false),
            'multiselect' => is_array($definition['default'] ?? null) ? $definition['default'] : [],
            'number'      => $definition['default'] ?? null,
            'image', 'file' => null,
            default       => $definition['default'] ?? '',
        };
    }

    // ============================================================
    // WRITE
    // ============================================================

    /**
     * @param array<string, mixed>          $existing key => single stored value.
     * @param array<int, array{0:string,1:string,2:mixed}> $ops     Collected set/delete operations.
     */
    private static function writeField(array $definition, string $prefix, mixed $value, array $existing, array &$ops): void
    {
        $type = $definition['type'];
        $full = self::fullName($prefix, $definition['name']);

        if ($type === 'group') {
            $group = is_array($value) ? $value : [];
            foreach ($definition['fields'] as $child) {
                self::writeField($child, $full, $group[$child['name']] ?? null, $existing, $ops);
            }
            return;
        }

        if ($type === 'repeater') {
            $rows      = is_array($value) ? array_values($value) : [];
            $new_count = count($rows);
            $old_count = (int) ($existing[self::VALUE_PREFIX . $full] ?? 0);

            $ops[] = ['set', self::VALUE_PREFIX . $full, $new_count];
            $ops[] = ['set', self::REF_PREFIX . $full, $definition['key']];

            $rows_to_process = max($new_count, $old_count);
            for ($i = 0; $i < $rows_to_process; $i++) {
                foreach ($definition['fields'] as $child) {
                    if ($i < $new_count) {
                        $row = is_array($rows[$i]) ? $rows[$i] : [];
                        self::writeField($child, "{$full}_{$i}", $row[$child['name']] ?? null, $existing, $ops);
                    } else {
                        self::deleteField($child, "{$full}_{$i}", $existing, $ops);
                    }
                }
            }
            return;
        }

        $ops[] = ['set', self::VALUE_PREFIX . $full, self::sanitizeValue($definition, $value)];
        $ops[] = ['set', self::REF_PREFIX . $full, $definition['key']];
    }

    /**
     * Recursively queue deletion of every key a field (and its rows) occupies.
     *
     * @param array<string, mixed>          $existing
     * @param array<int, array{0:string,1:string,2:mixed}> $ops
     */
    private static function deleteField(array $definition, string $prefix, array $existing, array &$ops): void
    {
        $type = $definition['type'];
        $full = self::fullName($prefix, $definition['name']);

        if ($type === 'group') {
            foreach ($definition['fields'] as $child) {
                self::deleteField($child, $full, $existing, $ops);
            }
            return;
        }

        if ($type === 'repeater') {
            $old_count = (int) ($existing[self::VALUE_PREFIX . $full] ?? 0);
            $ops[] = ['delete', self::VALUE_PREFIX . $full, null];
            $ops[] = ['delete', self::REF_PREFIX . $full, null];
            for ($i = 0; $i < $old_count; $i++) {
                foreach ($definition['fields'] as $child) {
                    self::deleteField($child, "{$full}_{$i}", $existing, $ops);
                }
            }
            return;
        }

        $ops[] = ['delete', self::VALUE_PREFIX . $full, null];
        $ops[] = ['delete', self::REF_PREFIX . $full, null];
    }

    private static function sanitizeValue(array $definition, mixed $value): mixed
    {
        return match ($definition['type']) {
            'textarea'    => sanitize_textarea_field((string) $value),
            'richtext'    => wp_kses_post((string) $value),
            'number'      => is_numeric($value) ? $value + 0 : '',
            'toggle'      => !empty($value) ? '1' : '',
            'multiselect' => is_array($value) ? array_values(array_map(fn($v) => sanitize_text_field((string) $v), $value)) : [],
            'url'         => esc_url_raw((string) $value),
            'email'       => sanitize_email((string) $value),
            'image', 'file' => absint($value),
            default       => sanitize_text_field((string) $value),
        };
    }

    // ============================================================
    // CONTENT VALIDATION (required + type)
    // ============================================================

    /**
     * Assert a nested value set is safe to persist: generated keys fit the length
     * limit and every value passes required/type validation. Runs before any write
     * so a rejected update never leaves a partial save behind.
     *
     * @param array<int, array<string, mixed>> $definitions Normalized definitions.
     * @param array<string, mixed>             $values      Nested input values.
     * @throws InvalidArgumentException
     */
    public static function assertWritable(array $definitions, array $values): void
    {
        CustomFieldsValidator::assertKeyLengthsOnly($definitions);

        foreach ($definitions as $definition) {
            self::assertValueValid($definition, $values[$definition['name']] ?? null, [$definition['label'] ?: $definition['name']]);
        }
    }

    /**
     * @param array<int, string> $trail Human label path for error reporting.
     * @throws InvalidArgumentException
     */
    private static function assertValueValid(array $definition, mixed $value, array $trail): void
    {
        $type  = $definition['type'];
        $label = implode(' › ', $trail);

        if ($type === 'group') {
            $group = is_array($value) ? $value : [];
            foreach ($definition['fields'] as $child) {
                self::assertValueValid($child, $group[$child['name']] ?? null, array_merge($trail, [$child['label'] ?: $child['name']]));
            }
            return;
        }

        if ($type === 'repeater') {
            $rows = is_array($value) ? array_values($value) : [];
            $min  = $definition['min'] ?? null;
            if (($definition['required'] || ($min !== null && $min > 0)) && count($rows) < max(1, (int) $min)) {
                throw new InvalidArgumentException("Custom field \"{$label}\" requires at least " . max(1, (int) $min) . " row(s).");
            }
            if ($definition['max'] !== null && count($rows) > $definition['max']) {
                throw new InvalidArgumentException("Custom field \"{$label}\" allows at most {$definition['max']} row(s).");
            }
            foreach ($rows as $i => $row) {
                $row = is_array($row) ? $row : [];
                foreach ($definition['fields'] as $child) {
                    self::assertValueValid($child, $row[$child['name']] ?? null, array_merge($trail, ["row " . ($i + 1), $child['label'] ?: $child['name']]));
                }
            }
            return;
        }

        $empty = $value === null || $value === '' || (is_array($value) && count($value) === 0);
        if ($definition['required'] && $empty) {
            throw new InvalidArgumentException("Custom field \"{$label}\" is required.");
        }
        if ($empty) {
            return;
        }

        self::assertScalarType($type, $value, $label, $definition);
    }

    private static function assertScalarType(string $type, mixed $value, string $label, array $definition): void
    {
        switch ($type) {
            case 'number':
                if (!is_numeric($value)) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" must be a number.");
                }
                break;
            case 'email':
                if (!is_email((string) $value)) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" must be a valid email address.");
                }
                break;
            case 'url':
                if (!filter_var((string) $value, FILTER_VALIDATE_URL)) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" must be a valid URL.");
                }
                break;
            case 'date':
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $value)) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" must be a date (YYYY-MM-DD).");
                }
                break;
            case 'select':
                if (!in_array((string) $value, self::choiceValues($definition), true)) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" has an invalid selection.");
                }
                break;
            case 'multiselect':
                $allowed = self::choiceValues($definition);
                foreach ((array) $value as $item) {
                    if (!in_array((string) $item, $allowed, true)) {
                        throw new InvalidArgumentException("Custom field \"{$label}\" has an invalid selection.");
                    }
                }
                break;
            case 'image':
                if (get_post_type((int) $value) !== 'attachment' || !str_starts_with((string) get_post_mime_type((int) $value), 'image/')) {
                    throw new InvalidArgumentException("Custom field \"{$label}\" must reference an uploaded image.");
                }
                break;
            case 'file':
                if (get_post_type((int) $value) !== 'attachment') {
                    throw new InvalidArgumentException("Custom field \"{$label}\" must reference an uploaded file.");
                }
                break;
        }
    }

    /**
     * @return array<int, string>
     */
    private static function choiceValues(array $definition): array
    {
        return array_map(fn($choice) => (string) $choice['value'], $definition['choices'] ?? []);
    }

    // ============================================================
    // META ACCESS
    // ============================================================

    private static function fullName(string $prefix, string $name): string
    {
        return $prefix === '' ? $name : "{$prefix}_{$name}";
    }

    /**
     * @return array<string, mixed> key => single (first) stored value.
     */
    private static function allMeta(string $meta_type, int $object_id): array
    {
        $raw = $meta_type === self::META_TERM
            ? get_term_meta($object_id)
            : get_post_meta($object_id);

        $flat = [];
        foreach ((array) $raw as $key => $values) {
            $flat[$key] = is_array($values) ? ($values[0] ?? null) : $values;
        }
        return $flat;
    }

    private static function updateMeta(string $meta_type, int $object_id, string $key, mixed $value): void
    {
        if ($meta_type === self::META_TERM) {
            update_term_meta($object_id, $key, $value);
        } else {
            update_post_meta($object_id, $key, $value);
        }
    }

    private static function deleteMeta(string $meta_type, int $object_id, string $key): void
    {
        if ($meta_type === self::META_TERM) {
            delete_term_meta($object_id, $key);
        } else {
            delete_post_meta($object_id, $key);
        }
    }
}
