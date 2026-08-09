<?php

namespace Kizlo\Modules\Introspection;

use Closure;

/**
 * Checks one schema tree and returns what is safe to publish.
 *
 * Cleaning and reporting are the same walk on purpose. Two passes that had to
 * agree about which keywords survive would eventually disagree, and the document
 * would then claim a constraint it had quietly dropped.
 *
 * The split follows one question: would a generated type come out wrong?
 *
 * - No. A keyword nobody recognizes, a constraint that means nothing on its type,
 *   a `default` that will not serialize. Dropped, with a warning. The type is
 *   unaffected, so the contract stays complete.
 * - Yes. A missing type, a `$ref` with no target, a non-boolean `required`. There
 *   is nothing honest to emit, so the whole schema is excluded and said so.
 *
 * A broken property excludes its parent rather than vanishing from it. Dropping
 * one field quietly is exactly the failure this contract exists to prevent.
 */
class SchemaValidator
{
    public function __construct(
        private SchemaResolver $resolver,
        private Diagnostics $diagnostics,
    ) {}

    /**
     * @param array<string, string> $location Locating keys shared by every entry from this tree.
     * @param array{property?: bool, file?: bool, stack?: array<int, string>} $context
     * @return array<string, mixed>|null Null when the schema cannot be published.
     */
    public function clean(mixed $schema, array $location, string $pointer, array $context = []): ?array
    {
        $isProperty = $context['property'] ?? false;
        $allowsFile = $context['file'] ?? false;
        $stack      = $context['stack'] ?? [];

        if (!is_array($schema)) {
            $this->error($location, $pointer, null, 'Schema must be an array.');
            return null;
        }

        $schema = $this->dropUnknownKeywords($schema, $location, $pointer);

        if (!$isProperty && array_key_exists('required', $schema)) {
            $this->warning($location, $pointer, 'required', '"required" is only valid on an object property. Ignored.');
            unset($schema['required']);
        }

        $unusableFlags = false;

        foreach (['required', 'nullable'] as $keyword) {
            if (array_key_exists($keyword, $schema) && !is_bool($schema[$keyword])) {
                $this->error(
                    $location,
                    $pointer,
                    $keyword,
                    sprintf('"%s" must be a boolean; it decides whether the generated field is optional, so it cannot be guessed.', $keyword),
                );
                $unusableFlags = true;
            }
        }

        if ($unusableFlags) {
            return null;
        }

        if (isset($schema['$ref'])) {
            return $this->cleanReference($schema, $location, $pointer);
        }

        if (isset($schema['anyOf']) || isset($schema['oneOf'])) {
            return $this->cleanUnion($schema, $location, $pointer, $context);
        }

        $type = $schema['type'] ?? null;

        if (!is_string($type) || !in_array($type, Spec::TYPES, true)) {
            $this->error(
                $location,
                $pointer,
                'type',
                is_string($type)
                    ? sprintf('Unknown type "%s".', $type)
                    : 'Schema must declare a "type", a "$ref", or a union.',
            );
            return null;
        }

        if ($type === 'file' && !$allowsFile) {
            $this->error($location, $pointer, 'type', 'The "file" type is only valid under a multipart/form-data request body.');
            return null;
        }

        $schema = $this->dropMisplacedKeywords($schema, $type, $location, $pointer);
        $schema = $this->dropUnusableConstraints($schema, $location, $pointer);

        if ($type === 'object') {
            return $this->cleanObject($schema, $location, $pointer, $context, $stack);
        }

        if ($type === 'array' && isset($schema['items'])) {
            $items = $this->clean($schema['items'], $location, self::child($pointer, 'items'), ['file' => $allowsFile, 'stack' => $stack]);

            if ($items === null) {
                return null;
            }

            $schema['items'] = $items;
        }

        /** @var array<string, mixed> $schema */
        return $schema;
    }

    // ============================================================
    // KEYWORDS THAT ARE SIMPLY DROPPED
    // ============================================================

    /**
     * @param array<array-key, mixed> $schema
     * @param array<string, string>   $location
     * @return array<array-key, mixed>
     */
    private function dropUnknownKeywords(array $schema, array $location, string $pointer): array
    {
        $known = Spec::allKeywords();

        foreach (array_keys($schema) as $keyword) {
            if (!is_string($keyword)) {
                $this->warning($location, $pointer, null, 'Schema keywords must be strings. Ignored.');
                unset($schema[$keyword]);
                continue;
            }

            if (in_array($keyword, Spec::RUNTIME_KEYWORDS, true)) {
                $this->warning($location, $pointer, $keyword, sprintf('"%s" only runs on a runtime route input. Ignored.', $keyword));
                unset($schema[$keyword]);
                continue;
            }

            if (!in_array($keyword, $known, true)) {
                $this->warning($location, $pointer, $keyword, self::unknownKeywordMessage($keyword));
                unset($schema[$keyword]);
            }
        }

        return $schema;
    }

    /**
     * `allOf` is worth a pointer rather than a shrug: it is the keyword people
     * reach for, and `$extends` is deliberately not the same thing. `allOf` means
     * "satisfies every subschema" over inline schemas; `$extends` merges a named
     * parent's properties and lets the child override them.
     */
    private static function unknownKeywordMessage(string $keyword): string
    {
        if ($keyword === 'allOf') {
            return 'Unknown keyword "allOf". Use "$extends" with a schema ID to merge a parent\'s properties. Ignored.';
        }

        return sprintf('Unknown keyword "%s". Ignored.', $keyword);
    }

    /**
     * @param array<array-key, mixed> $schema
     * @param array<string, string>   $location
     * @return array<array-key, mixed>
     */
    private function dropMisplacedKeywords(array $schema, string $type, array $location, string $pointer): array
    {
        $allowed = array_merge(Spec::UNIVERSAL_KEYWORDS, Spec::TYPE_KEYWORDS[$type] ?? []);

        foreach (array_keys($schema) as $keyword) {
            if (!is_string($keyword) || in_array($keyword, $allowed, true)) {
                continue;
            }

            $this->warning($location, $pointer, $keyword, sprintf('"%s" means nothing on type "%s". Ignored.', $keyword, $type));
            unset($schema[$keyword]);
        }

        return $schema;
    }

    /**
     * @param array<array-key, mixed> $schema
     * @param array<string, string>   $location
     * @return array<array-key, mixed>
     */
    private function dropUnusableConstraints(array $schema, array $location, string $pointer): array
    {
        $drop = function (string $keyword, string $why) use (&$schema, $location, $pointer): void {
            $this->warning($location, $pointer, $keyword, $why . ' Ignored.');
            unset($schema[$keyword]);
        };

        foreach (['uniqueItems', 'deprecated'] as $keyword) {
            if (array_key_exists($keyword, $schema) && !is_bool($schema[$keyword])) {
                $drop($keyword, sprintf('"%s" must be a boolean.', $keyword));
            }
        }

        foreach (['format', 'pattern', 'title', 'description'] as $keyword) {
            if (array_key_exists($keyword, $schema) && !is_string($schema[$keyword])) {
                $drop($keyword, sprintf('"%s" must be a string.', $keyword));
            }
        }

        foreach (['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties'] as $keyword) {
            if (array_key_exists($keyword, $schema) && (!is_int($schema[$keyword]) || $schema[$keyword] < 0)) {
                $drop($keyword, sprintf('"%s" must be a non-negative integer.', $keyword));
            }
        }

        foreach (['minimum', 'maximum', 'multipleOf'] as $keyword) {
            if (array_key_exists($keyword, $schema) && !is_int($schema[$keyword]) && !is_float($schema[$keyword])) {
                $drop($keyword, sprintf('"%s" must be a number.', $keyword));
            }
        }

        // Draft-04 spelling, matching what rest_validate_value_from_schema()
        // implements: a boolean flag that makes the paired bound exclusive.
        foreach (['exclusiveMinimum' => 'minimum', 'exclusiveMaximum' => 'maximum'] as $keyword => $bound) {
            if (!array_key_exists($keyword, $schema)) {
                continue;
            }
            if (!is_bool($schema[$keyword])) {
                $drop($keyword, sprintf('"%s" must be a boolean that makes "%s" exclusive.', $keyword, $bound));
            } elseif (!array_key_exists($bound, $schema)) {
                $drop($keyword, sprintf('"%s" requires "%s".', $keyword, $bound));
            }
        }

        if (array_key_exists('enum', $schema)) {
            if (!is_array($schema['enum']) || $schema['enum'] === []) {
                $drop('enum', '"enum" must be a non-empty list of values.');
            } elseif (array_values($schema['enum']) !== $schema['enum']) {
                $drop('enum', '"enum" must be a list, not a map.');
            }
        }

        foreach (['default', 'enum'] as $keyword) {
            if (array_key_exists($keyword, $schema) && !self::isSerializable($schema[$keyword])) {
                $drop($keyword, sprintf('"%s" must be JSON-serializable.', $keyword));
            }
        }

        if (isset($schema['pattern']) && is_string($schema['pattern']) && !self::compiles($schema['pattern'])) {
            $drop('pattern', '"pattern" is not a usable regular expression.');
        }

        return $schema;
    }

    // ============================================================
    // BRANCHES
    // ============================================================

    /**
     * @param array<array-key, mixed> $schema
     * @param array<string, string>   $location
     * @return array<string, mixed>|null
     */
    private function cleanReference(array $schema, array $location, string $pointer): ?array
    {
        $ref = $schema['$ref'];

        if (!Spec::isValidSchemaId($ref)) {
            $this->error($location, $pointer, '$ref', sprintf('"%s" is not a valid schema ID.', is_string($ref) ? $ref : gettype($ref)));
            return null;
        }

        if (!$this->resolver->has($ref)) {
            $this->error($location, $pointer, '$ref', sprintf('Unknown schema "%s".', $ref));
            return null;
        }

        foreach (array_keys($schema) as $keyword) {
            if (!in_array($keyword, ['$ref', 'required', 'nullable', 'description'], true)) {
                $this->warning(
                    $location,
                    $pointer,
                    (string) $keyword,
                    sprintf('A "$ref" may only carry "required", "nullable" and "description"; "%s" would redefine the referenced schema. Ignored.', (string) $keyword),
                );
                unset($schema[$keyword]);
            }
        }

        /** @var array<string, mixed> $schema */
        return $schema;
    }

    /**
     * @param array<array-key, mixed> $schema
     * @param array<string, string>   $location
     * @param array{property?: bool, file?: bool, stack?: array<int, string>} $context
     * @return array<string, mixed>|null
     */
    private function cleanUnion(array $schema, array $location, string $pointer, array $context): ?array
    {
        if (isset($schema['anyOf']) && isset($schema['oneOf'])) {
            $this->error($location, $pointer, 'anyOf', 'A schema declares either "anyOf" or "oneOf", not both.');
            return null;
        }

        if (isset($schema['type'])) {
            $this->warning($location, $pointer, 'type', 'A union schema does not also declare a "type". Ignored.');
            unset($schema['type']);
        }

        $keyword = isset($schema['anyOf']) ? 'anyOf' : 'oneOf';
        $members = $schema[$keyword];

        if (!is_array($members) || $members === []) {
            $this->error($location, $pointer, (string) $keyword, sprintf('"%s" must be a non-empty list of schemas.', $keyword));
            return null;
        }

        $cleaned = [];
        foreach (array_values($members) as $index => $member) {
            $child = $this->clean($member, $location, self::child($pointer, sprintf('%s[%d]', $keyword, $index)), [
                'file'  => $context['file'] ?? false,
                'stack' => $context['stack'] ?? [],
            ]);

            if ($child === null) {
                // A union missing one member is a different type, not a narrower one.
                return null;
            }

            $cleaned[] = $child;
        }

        $schema[$keyword] = $cleaned;

        /** @var array<string, mixed> $schema */
        return $schema;
    }

    /**
     * @param array<array-key, mixed> $schema
     * @param array<string, string>   $location
     * @param array{property?: bool, file?: bool, stack?: array<int, string>} $context
     * @param array<int, string>      $stack
     * @return array<string, mixed>|null
     */
    private function cleanObject(array $schema, array $location, string $pointer, array $context, array $stack): ?array
    {
        if (isset($schema['$extends']) && !$this->checkExtends($schema, $location, $pointer, $stack)) {
            return null;
        }

        $allowsFile = $context['file'] ?? false;

        if (isset($schema['properties'])) {
            if (!is_array($schema['properties'])) {
                $this->error($location, $pointer, 'properties', '"properties" must be a map of property name to schema.');
                return null;
            }

            $properties = [];
            foreach ($schema['properties'] as $name => $property) {
                if (!is_string($name) || $name === '') {
                    $this->error($location, $pointer, 'properties', 'Property names must be non-empty strings.');
                    return null;
                }

                $child = $this->clean($property, $location, self::child($pointer, 'properties.' . $name), [
                    'property' => true,
                    'file'     => $allowsFile,
                    'stack'    => $stack,
                ]);

                if ($child === null) {
                    // Dropping the property instead would remove a field from the
                    // generated type without the consumer ever knowing.
                    return null;
                }

                $properties[$name] = $child;
            }

            $schema['properties'] = $properties;
        }

        if (isset($schema['patternProperties'])) {
            if (!is_array($schema['patternProperties'])) {
                $this->warning($location, $pointer, 'patternProperties', '"patternProperties" must be a map of pattern to schema. Ignored.');
                unset($schema['patternProperties']);
            } else {
                $patterns = [];
                foreach ($schema['patternProperties'] as $pattern => $property) {
                    $child = $this->clean($property, $location, self::child($pointer, 'patternProperties.' . (string) $pattern), [
                        'file'  => $allowsFile,
                        'stack' => $stack,
                    ]);

                    if ($child !== null) {
                        $patterns[$pattern] = $child;
                    }
                }
                $schema['patternProperties'] = $patterns;
            }
        }

        if (array_key_exists('additionalProperties', $schema) && !is_bool($schema['additionalProperties'])) {
            if (!is_array($schema['additionalProperties'])) {
                $this->warning($location, $pointer, 'additionalProperties', '"additionalProperties" must be a boolean or a schema. Ignored.');
                unset($schema['additionalProperties']);
            } else {
                $child = $this->clean($schema['additionalProperties'], $location, self::child($pointer, 'additionalProperties'), [
                    'file'  => $allowsFile,
                    'stack' => $stack,
                ]);

                if ($child === null) {
                    return null;
                }

                $schema['additionalProperties'] = $child;
            }
        }

        /** @var array<string, mixed> $schema */
        return $schema;
    }

    /**
     * @param array<array-key, mixed> $schema
     * @param array<string, string>   $location
     * @param array<int, string>      $stack
     */
    private function checkExtends(array $schema, array $location, string $pointer, array $stack): bool
    {
        $parents = is_array($schema['$extends']) ? $schema['$extends'] : [$schema['$extends']];

        foreach ($parents as $parent) {
            if (!Spec::isValidSchemaId($parent)) {
                $this->error(
                    $location,
                    $pointer,
                    '$extends',
                    sprintf('"%s" is not a valid schema ID.', is_string($parent) ? $parent : gettype($parent)),
                );
                return false;
            }
        }

        $before = count($this->diagnostics->all());

        $this->resolver->mergeExtends($schema, $this->diagnostics, $location + ['pointer' => $pointer], $stack);

        return count($this->diagnostics->all()) === $before;
    }

    // ============================================================
    // HELPERS
    // ============================================================

    private static function isSerializable(mixed $value): bool
    {
        if ($value instanceof Closure || is_object($value) || is_resource($value)) {
            return false;
        }

        if (is_array($value)) {
            foreach ($value as $item) {
                if (!self::isSerializable($item)) {
                    return false;
                }
            }
        }

        return true;
    }

    /** Delimiters mirror how WordPress wraps a pattern before running it. */
    private static function compiles(string $pattern): bool
    {
        return @preg_match('#' . str_replace('#', '\\#', $pattern) . '#u', '') !== false;
    }

    /** A registered schema's root has no pointer, so its children start unprefixed. */
    private static function child(string $pointer, string $segment): string
    {
        return $pointer === '' ? $segment : $pointer . '.' . $segment;
    }

    /**
     * @param array<string, string> $location
     */
    private function error(array $location, string $pointer, ?string $keyword, string $message): void
    {
        $this->diagnostics->error($this->locate($location, $pointer, $keyword), $message);
    }

    /**
     * @param array<string, string> $location
     */
    private function warning(array $location, string $pointer, ?string $keyword, string $message): void
    {
        $this->diagnostics->warning($this->locate($location, $pointer, $keyword), $message);
    }

    /**
     * @param array<string, string> $location
     * @return array<string, string>
     */
    private function locate(array $location, string $pointer, ?string $keyword): array
    {
        if ($pointer !== '') {
            $location['pointer'] = $pointer;
        }

        if ($keyword !== null) {
            $location['keyword'] = $keyword;
        }

        return $location;
    }
}
