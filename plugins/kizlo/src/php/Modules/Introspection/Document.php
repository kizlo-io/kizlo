<?php

namespace Kizlo\Modules\Introspection;

use stdClass;

/**
 * Serialization rules for the introspection document.
 *
 * The document is a build artifact for a code generator, so byte stability
 * matters more than prettiness: unchanged configuration must produce an
 * unchanged `hash`, which then backs the `ETag`. PHP preserves array insertion
 * order, so determinism comes from the registry sorting before it gets here.
 */
class Document
{
    /**
     * The vocabulary and semantics understood by contract consumers.
     *
     * Change this only when an introspection document becomes incompatible,
     * such as when a field is removed or changes meaning. Compatible additions
     * keep the current version. This is independent of the plugin version sent
     * in `X-Kizlo-Version`.
     */
    public const VERSION = '1.0';

    /**
     * Keys whose value is a map. An empty PHP array encodes as `[]`, which would
     * hand the generator a list where it expects an object, so empty maps become
     * real JSON objects.
     *
     * @var array<int, string>
     */
    private const MAP_KEYS = ['schemas', 'apis', 'paths', 'properties', 'patternProperties', 'responses', 'data'];

    public static function encode(mixed $value): string
    {
        return (string) wp_json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    }

    /**
     * @param array<string, mixed> $document
     * @return array<string, mixed>
     */
    public static function finalize(array $document): array
    {
        /** @var array<string, mixed> $normalized */
        $normalized = self::normalize(['version' => self::VERSION] + $document, null);

        return [
            'version' => self::VERSION,
            'hash'    => self::hash($normalized),
        ] + $normalized;
    }

    /**
     * @param array<string, mixed> $document
     */
    public static function hash(array $document): string
    {
        $hashable = $document;
        unset($hashable['hash']);

        return 'sha256:' . hash('sha256', self::encode($hashable));
    }

    private static function normalize(mixed $value, ?string $key): mixed
    {
        if (!is_array($value)) {
            return $value;
        }

        if ($value === [] && $key !== null && in_array($key, self::MAP_KEYS, true)) {
            return new stdClass();
        }

        $normalized = [];
        foreach ($value as $childKey => $child) {
            $normalized[$childKey] = self::normalize($child, is_string($childKey) ? $childKey : $key);
        }

        return $normalized;
    }
}
