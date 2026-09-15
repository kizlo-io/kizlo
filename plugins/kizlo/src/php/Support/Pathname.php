<?php

namespace Kizlo\Support;

class Pathname
{
    /**
     * Normalize a stored URL pathname structure.
     *
     * The stored value is the whole source of the public URL, and URL paths are
     * case-sensitive, so a cased or slash-inconsistent value silently publishes a
     * second URL for the same content. Lowercase the value, give it exactly one
     * leading slash, collapse repeated separators, and drop the trailing slash.
     *
     * @param  string $value Raw pathname structure, with or without variable tokens.
     * @return string|null   Normalized structure, or null when nothing is left.
     */
    public static function normalize(string $value): ?string
    {
        $value = strtolower(trim($value));

        if ($value === '') {
            return null;
        }

        $value = '/' . ltrim($value, '/');
        $value = (string) preg_replace('#/+#', '/', $value);
        $value = rtrim($value, '/');

        return $value === '' ? null : $value;
    }
}
