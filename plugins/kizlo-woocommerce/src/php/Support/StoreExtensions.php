<?php

namespace Kizlo\WooCommerce\Support;

/**
 * Writing into a Store API response's `extensions` bag.
 *
 * The bag arrives in two shapes. WooCommerce builds it with
 * `ExtendSchema::get_endpoint_data()`, which casts the namespaces to an object,
 * and a response filter that creates the key where no extension point exists
 * writes an array. A writer that handles only one shape either destroys the other
 * or silently declines to write, and declining is the worse failure: the caller
 * reads a stale default as though it were an answer.
 */
final class StoreExtensions
{
    /**
     * One namespace's fields merged into the bag, keeping every other namespace and
     * every field already in that namespace. A non-empty assoc array is returned
     * because it encodes as a JSON object and the merged namespace is always there.
     *
     * @param  array<string, mixed> $fields
     * @return array<string, mixed>
     */
    public static function merge(mixed $extensions, string $namespace, array $fields): array
    {
        $namespaces = self::toArray($extensions);

        $namespaces[$namespace] = array_merge(self::toArray($namespaces[$namespace] ?? null), $fields);

        return $namespaces;
    }

    /** @return array<string, mixed> */
    private static function toArray(mixed $value): array
    {
        return match (true) {
            is_object($value) => get_object_vars($value),
            is_array($value)  => $value,
            default           => [],
        };
    }
}
