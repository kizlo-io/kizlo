<?php

namespace Kizlo\Acf\Modules\Acf;

use DateTimeImmutable;

/**
 * Resolves an object's ACF values into the shape {@see AcfSchema} declares.
 *
 * ACF's formatted value depends on each field's `return_format`, so the same
 * field type can read back as an ID, a URL or an array from one site to the
 * next. Reading the stored value instead (`get_fields($id, false)`) gives one
 * predictable shape: choice keys, attachment IDs and object IDs, which are what
 * the declared enums, media `$ref`s and integer references describe. This
 * resolver walks the definitions against those stored values and formats only
 * the cases where storage and contract differ — numbers, booleans, dates and
 * media.
 */
class AcfValues
{
    /**
     * @param array<int, array<string, mixed>> $fields Flat field definitions across the object's groups.
     * @param int|string                       $id     The ACF object id (post id, or `term_<id>` etc.).
     * @return array<string, mixed>
     */
    public static function resolve(array $fields, int|string $id): array
    {
        $stored = get_fields($id, false);

        return self::from($fields, is_array($stored) ? $stored : []);
    }

    /**
     * @param array<int, array<string, mixed>> $fields
     * @param array<string, mixed>             $values Stored values keyed by field name.
     * @return array<string, mixed>
     */
    private static function from(array $fields, array $values): array
    {
        $out = [];

        foreach ($fields as $field) {
            $name = (string) ($field['name'] ?? '');

            if ($name === '') {
                continue;
            }

            $out[$name] = self::value($field, $values[$name] ?? null);
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return mixed
     */
    private static function value(array $field, $raw)
    {
        $type = (string) ($field['type'] ?? '');

        return match ($type) {
            'number', 'range'  => self::number($raw),
            'true_false'       => (bool) $raw,
            'image'            => self::image($raw),
            'file'             => self::file($raw),
            'gallery'          => array_values(array_filter(array_map(self::image(...), self::ids($raw)))),
            'date_picker'      => self::date($raw, 'Ymd', 'Y-m-d'),
            'date_time_picker' => self::date($raw, 'Y-m-d H:i:s', 'c'),
            'group'            => self::from(self::subFields($field), is_array($raw) ? $raw : []),
            'repeater'         => self::repeater($field, $raw),
            default            => $raw,
        };
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return array<int, array<string, mixed>>
     */
    private static function repeater(array $field, $raw): array
    {
        if (!is_array($raw)) {
            return [];
        }

        $sub  = self::subFields($field);
        $rows = [];

        foreach ($raw as $row) {
            $rows[] = self::from($sub, is_array($row) ? $row : []);
        }

        return $rows;
    }

    /**
     * @param array<string, mixed> $field
     * @return array<int, array<string, mixed>>
     */
    private static function subFields(array $field): array
    {
        return is_array($field['sub_fields'] ?? null) ? $field['sub_fields'] : [];
    }

    /**
     * @param mixed $raw
     * @return int|float|null
     */
    private static function number($raw)
    {
        if ($raw === '' || $raw === null || !is_numeric($raw)) {
            return null;
        }

        return $raw + 0;
    }

    /**
     * @param mixed $raw
     * @return array<string, mixed>|null
     */
    private static function image($raw): ?array
    {
        $id = self::id($raw);

        return $id ? kizlo_ensure_media_image_data($id) : null;
    }

    /**
     * @param mixed $raw
     * @return array<string, mixed>|null
     */
    private static function file($raw): ?array
    {
        $id = self::id($raw);

        return $id ? kizlo_ensure_media_data($id) : null;
    }

    /**
     * @param mixed $raw
     */
    private static function date($raw, string $stored, string $output): ?string
    {
        if (!is_string($raw) || $raw === '') {
            return null;
        }

        $date = DateTimeImmutable::createFromFormat($stored, $raw);

        return $date ? $date->format($output) : $raw;
    }

    /**
     * @param mixed $raw
     */
    private static function id($raw): int
    {
        if (is_array($raw)) {
            $raw = $raw['ID'] ?? $raw['id'] ?? 0;
        }

        return is_numeric($raw) ? (int) $raw : 0;
    }

    /**
     * @param mixed $raw
     * @return array<int, int>
     */
    private static function ids($raw): array
    {
        if (!is_array($raw)) {
            return [];
        }

        return array_values(array_filter(array_map(self::id(...), $raw)));
    }
}
