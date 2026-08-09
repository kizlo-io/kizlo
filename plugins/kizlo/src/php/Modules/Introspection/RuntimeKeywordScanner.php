<?php

namespace Kizlo\Modules\Introspection;

/**
 * Finds `sanitize_callback` / `validate_callback` in a declared input.
 *
 * WordPress only honours them on a top-level route argument, so a nested one is
 * a silent no-op — the kind of mistake that looks like working validation until
 * something malformed gets through. Registration reports them instead.
 */
class RuntimeKeywordScanner
{
    /**
     * @param array<array-key, mixed> $schema
     * @return array<int, array{pointer: string, keyword: string}>
     */
    public static function find(array $schema, string $pointer = ''): array
    {
        $found = [];

        foreach ($schema as $keyword => $value) {
            if (!is_string($keyword)) {
                continue;
            }

            if (in_array($keyword, Spec::RUNTIME_KEYWORDS, true)) {
                $found[] = ['pointer' => $pointer === '' ? 'input' : $pointer, 'keyword' => $keyword];
                continue;
            }

            if (!is_array($value)) {
                continue;
            }

            $children = match ($keyword) {
                'properties', 'patternProperties', 'anyOf', 'oneOf' => $value,
                'items', 'additionalProperties'                     => ['' => $value],
                default                                             => [],
            };

            foreach ($children as $name => $child) {
                if (!is_array($child)) {
                    continue;
                }

                $childPointer = $name === '' ? $keyword : sprintf('%s.%s', $keyword, (string) $name);
                $childPointer = $pointer === '' ? $childPointer : sprintf('%s.%s', $pointer, $childPointer);

                $found = array_merge($found, self::find($child, $childPointer));
            }
        }

        return $found;
    }

    /**
     * Callbacks WordPress will actually run: those on a top-level input property.
     *
     * @param array<int, array{pointer: string, keyword: string}> $found
     * @return array<int, array{pointer: string, keyword: string}>
     */
    public static function ignored(array $found): array
    {
        return array_values(array_filter(
            $found,
            static fn(array $hit): bool => preg_match('/^properties\.[^.]+$/', $hit['pointer']) !== 1,
        ));
    }
}
