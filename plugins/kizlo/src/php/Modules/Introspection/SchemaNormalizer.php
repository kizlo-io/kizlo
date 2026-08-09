<?php

namespace Kizlo\Modules\Introspection;

/**
 * Prepares a declared schema for the emitted document.
 *
 * Two transformations, both narrow. The runtime-only callbacks are removed: they
 * are PHP callables, so they are neither serializable nor safe to publish. And
 * {@see SchemaCoercer} repairs values whose intent is unambiguous. Everything
 * else — including keys the contract does not recognize — is left exactly as
 * declared, so {@see SchemaValidator} can report them rather than have them
 * vanish silently.
 *
 * `$ref` and `$extends` are deliberately *not* resolved here. Inlining them would
 * destroy the named-type information the TypeScript generator depends on: it
 * could no longer emit `interface Book extends Post`, and every use of
 * `kizlo.media` would become a duplicated copy of that shape.
 */
class SchemaNormalizer
{
    /**
     * @param array<array-key, mixed> $schema
     * @return array<array-key, mixed>
     */
    public static function normalize(array $schema): array
    {
        // The coercer already walks the whole tree, so it runs once here and the
        // callback strip recurses on its own.
        return self::stripCallbacks(SchemaCoercer::coerce($schema));
    }

    /**
     * @param array<array-key, mixed> $schema
     * @return array<array-key, mixed>
     */
    private static function stripCallbacks(array $schema): array
    {
        $stripped = [];

        foreach ($schema as $keyword => $value) {
            if (in_array($keyword, Spec::RUNTIME_KEYWORDS, true)) {
                continue;
            }

            $stripped[$keyword] = is_string($keyword) ? self::stripValue($keyword, $value) : $value;
        }

        return $stripped;
    }

    private static function stripValue(string $keyword, mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }

        return match ($keyword) {
            'properties', 'patternProperties' => array_map(
                static fn(mixed $child): mixed => is_array($child) ? self::stripCallbacks($child) : $child,
                $value,
            ),
            'items', 'additionalProperties' => self::stripCallbacks($value),
            'anyOf', 'oneOf' => array_values(array_map(
                static fn(mixed $child): mixed => is_array($child) ? self::stripCallbacks($child) : $child,
                $value,
            )),
            default => $value,
        };
    }
}
