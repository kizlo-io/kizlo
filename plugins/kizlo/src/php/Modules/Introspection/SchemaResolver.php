<?php

namespace Kizlo\Modules\Introspection;

/**
 * Resolves `$ref` and `$extends` against the registered schema map.
 *
 * Two callers, two reasons. {@see SchemaValidator} resolves only to prove that
 * targets exist, parents are objects, overrides are compatible and nothing is
 * circular — it throws the resolved form away. {@see ArgTranslator} resolves
 * because `register_rest_route()` needs one flat concrete schema and understands
 * neither keyword.
 *
 * Nothing else resolves. The emitted document keeps both keywords intact.
 */
class SchemaResolver
{
    /** @param array<string, array<string, mixed>> $schemas Registered schemas by ID. */
    public function __construct(private array $schemas) {}

    public function has(string $id): bool
    {
        return isset($this->schemas[$id]);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function get(string $id): ?array
    {
        return $this->schemas[$id] ?? null;
    }

    /**
     * Merge every `$extends` parent's properties into an object schema.
     *
     * Parents merge left to right and the child's own properties land last, so a
     * child may narrow an inherited property but not change its type.
     *
     * @param array<string, mixed> $schema
     * @param array<string, string> $location
     * @param array<int, string>   $stack   Schema IDs currently being expanded.
     * @return array<string, mixed>
     */
    public function mergeExtends(array $schema, Diagnostics $errors, array $location, array $stack = []): array
    {
        if (!isset($schema['$extends'])) {
            return $schema;
        }

        $parents = is_array($schema['$extends']) ? $schema['$extends'] : [$schema['$extends']];

        /** @var array<string, array<string, mixed>> $properties */
        $properties = [];
        /** @var array<string, string> $origins */
        $origins = [];

        foreach ($parents as $parent) {
            if (!is_string($parent)) {
                $errors->error($location + ['keyword' => '$extends'], 'Parent schema must be a schema ID string.');
                continue;
            }

            if (in_array($parent, $stack, true)) {
                $errors->error(
                    $location + ['keyword' => '$extends'],
                    sprintf('Circular inheritance through "%s".', $parent),
                );
                continue;
            }

            $resolved = $this->get($parent);

            if ($resolved === null) {
                $errors->error(
                    $location + ['keyword' => '$extends'],
                    sprintf('Unknown parent schema "%s".', $parent),
                );
                continue;
            }

            if (isset($resolved['anyOf']) || isset($resolved['oneOf'])) {
                $errors->error(
                    $location + ['keyword' => '$extends'],
                    sprintf('Parent schema "%s" is a union; there is nothing to merge into.', $parent),
                );
                continue;
            }

            $resolved = $this->mergeExtends($resolved, $errors, $location, array_merge($stack, [$parent]));

            if (($resolved['type'] ?? 'object') !== 'object') {
                $errors->error(
                    $location + ['keyword' => '$extends'],
                    sprintf('Parent schema "%s" is not an object schema.', $parent),
                );
                continue;
            }

            foreach ($this->propertiesOf($resolved) as $name => $property) {
                $this->assertCompatible($name, $properties[$name] ?? null, $origins[$name] ?? '', $property, $parent, $errors, $location);
                $properties[$name] = $property;
                $origins[$name]    = $parent;
            }
        }

        foreach ($this->propertiesOf($schema) as $name => $property) {
            $this->assertCompatible($name, $properties[$name] ?? null, $origins[$name] ?? '', $property, '', $errors, $location);
            $properties[$name] = $property;
        }

        $merged = $schema;
        unset($merged['$extends']);
        $merged['type']       = 'object';
        $merged['properties'] = $properties;

        return $merged;
    }

    /**
     * Fully resolve a schema into the flat concrete form `register_rest_route()`
     * needs. Recursive `$ref`s collapse to their bare type rather than looping.
     *
     * @param array<string, mixed> $schema
     * @param array<int, string>   $stack
     * @return array<string, mixed>
     */
    public function resolve(array $schema, array $stack = []): array
    {
        $discard = new Diagnostics();

        if (isset($schema['$ref']) && is_string($schema['$ref'])) {
            $id     = $schema['$ref'];
            $target = $this->get($id);

            if ($target === null) {
                $resolved = [];
            } elseif (in_array($id, $stack, true)) {
                $resolved = ['type' => $target['type'] ?? 'object'];
            } else {
                $resolved = $this->resolve($target, array_merge($stack, [$id]));
            }

            foreach (['required', 'nullable', 'description'] as $keyword) {
                if (array_key_exists($keyword, $schema)) {
                    $resolved[$keyword] = $schema[$keyword];
                }
            }

            return $resolved;
        }

        if (isset($schema['$extends'])) {
            $schema = $this->mergeExtends($schema, $discard, [], $stack);
        }

        $resolved = [];
        foreach ($schema as $keyword => $value) {
            $resolved[$keyword] = match (true) {
                in_array($keyword, ['properties', 'patternProperties'], true) && is_array($value) => array_map(
                    fn(mixed $child): mixed => is_array($child) ? $this->resolve($child, $stack) : $child,
                    $value,
                ),
                in_array($keyword, ['items', 'additionalProperties'], true) && is_array($value) => $this->resolve($value, $stack),
                in_array($keyword, ['anyOf', 'oneOf'], true) && is_array($value) => array_values(array_map(
                    fn(mixed $child): mixed => is_array($child) ? $this->resolve($child, $stack) : $child,
                    $value,
                )),
                default => $value,
            };
        }

        return $resolved;
    }

    /**
     * @param array<string, mixed> $schema
     * @return array<string, array<string, mixed>>
     */
    private function propertiesOf(array $schema): array
    {
        if (!isset($schema['properties']) || !is_array($schema['properties'])) {
            return [];
        }

        $properties = [];
        foreach ($schema['properties'] as $name => $property) {
            if (is_string($name) && is_array($property)) {
                $properties[$name] = $property;
            }
        }

        return $properties;
    }

    /**
     * @param array<string, mixed>|null $existing
     * @param array<string, mixed>      $incoming
     * @param array<string, string>     $location
     */
    private function assertCompatible(
        string $name,
        ?array $existing,
        string $existingOrigin,
        array $incoming,
        string $incomingOrigin,
        Diagnostics $errors,
        array $location,
    ): void {
        if ($existing === null) {
            return;
        }

        $before = $this->typeSignature($existing);
        $after  = $this->typeSignature($incoming);

        if ($before === $after) {
            return;
        }

        $errors->error(
            $location + ['keyword' => '$extends'],
            sprintf(
                'Property "%s" is %s in "%s" but %s in %s.',
                $name,
                $before,
                $existingOrigin,
                $after,
                $incomingOrigin === '' ? 'the extending schema' : sprintf('"%s"', $incomingOrigin),
            ),
        );
    }

    /**
     * @param array<string, mixed> $schema
     */
    private function typeSignature(array $schema): string
    {
        if (isset($schema['$ref']) && is_string($schema['$ref'])) {
            return sprintf('a reference to "%s"', $schema['$ref']);
        }

        if (isset($schema['anyOf']) || isset($schema['oneOf'])) {
            return 'a union';
        }

        if (isset($schema['type']) && is_string($schema['type'])) {
            return sprintf('type "%s"', $schema['type']);
        }

        return 'untyped';
    }
}
