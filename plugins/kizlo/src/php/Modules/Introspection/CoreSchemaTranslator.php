<?php

namespace Kizlo\Modules\Introspection;

/**
 * One WordPress schema, rewritten in the vocabulary the contract has.
 *
 * Three derivations share this: the list parameters in {@see CoreCollectionParams},
 * and the response and write properties in {@see CoreItemSchema}. All three read
 * a controller and all three face the same two problems, so the translation lives
 * here rather than three times over.
 *
 * Translation is faithful rather than editorial. Nothing is dropped for being
 * untidy; only shapes Kizlo spells differently are rewritten, and only something
 * that cannot be expressed at all is dropped. What to say about that is left to
 * the caller, because a parameter the route silently accepts and a response field
 * the route silently returns deserve different sentences.
 *
 * Runtime callbacks survive on purpose. They reach the route through
 * {@see ArgTranslator}, so a derived property is validated by the same sanitizer
 * core would have used, and {@see SchemaNormalizer} strips them before anything
 * is published.
 */
final class CoreSchemaTranslator
{
    /**
     * Keys are `array-key` rather than `string` because a parameter set passes
     * through `rest_{$type}_collection_params` and an item schema through
     * `rest_{$post_type}_item_schema` on the way here, and a filter can return
     * anything.
     *
     * @param array<array-key, mixed> $source
     * @param callable(string): void  $report Called with the name of anything untranslatable.
     * @return array<string, array<string, mixed>>
     */
    public static function properties(array $source, callable $report): array
    {
        $properties = [];

        foreach ($source as $name => $property) {
            if (!is_string($name) || $name === '') {
                continue;
            }

            $schema = self::schema($property);

            if ($schema === null) {
                $report($name);

                continue;
            }

            $properties[$name] = $schema;
        }

        return $properties;
    }

    /**
     * @return array<string, mixed>|null Null when nothing honest can be emitted.
     */
    public static function schema(mixed $property): ?array
    {
        $property = self::mapping($property);

        if ($property === null) {
            return null;
        }

        $schema = [];

        foreach ($property as $keyword => $value) {
            // `context`, `readonly` and `arg_options` are WordPress bookkeeping,
            // and anything else unrecognized would be dropped with a warning
            // further down.
            if (is_string($keyword) && in_array($keyword, self::known(), true)) {
                $schema[$keyword] = $value;
            }
        }

        $schema = self::resolveType($schema);

        if ($schema === null) {
            return null;
        }

        foreach (['properties', 'patternProperties'] as $keyword) {
            $block = self::mapping($schema[$keyword] ?? null);

            if ($block === null) {
                continue;
            }

            $schema[$keyword] = $block;
            $children         = [];

            foreach ($block as $name => $child) {
                $translated = self::schema($child);

                // A parent missing one property is a different shape, not a
                // narrower one, so it fails with the child.
                if ($translated === null) {
                    return null;
                }

                $children[$name] = $translated;
            }

            $schema[$keyword] = $children;
        }

        foreach (['anyOf', 'oneOf'] as $keyword) {
            if (!isset($schema[$keyword]) || !is_array($schema[$keyword])) {
                continue;
            }

            $members = [];

            foreach ($schema[$keyword] as $member) {
                $translated = self::schema($member);

                if ($translated === null) {
                    return null;
                }

                $members[] = $translated;
            }

            $schema[$keyword] = $members;
        }

        foreach (['items', 'additionalProperties'] as $keyword) {
            if (!isset($schema[$keyword]) || self::mapping($schema[$keyword]) === null) {
                continue;
            }

            $translated = self::schema($schema[$keyword]);

            if ($translated === null) {
                return null;
            }

            $schema[$keyword] = $translated;
        }

        return $schema;
    }

    /**
     * Every JSON type, for a property that declares it accepts anything.
     *
     * @var array<int, string>
     */
    private const ANY = ['string', 'integer', 'number', 'boolean', 'object', 'array'];

    /**
     * Rewrite WordPress's type spellings into the two Kizlo has.
     *
     * Core writes a multi-type argument as a list, which the contract does not
     * have. The per-taxonomy filters are `['object', 'array']` beside a `oneOf`
     * naming both shapes, so the list is redundant there and the union carries the
     * meaning. A bare list with no union beside it is still a union, just spelled
     * the other way round, and `['string', 'null']` is what `nullable` means.
     *
     * Three spellings are nobody's standard, and dropping the fields that use them
     * would be the wrong kind of strict: they are returned either way, so the
     * choice is between describing them and pretending they are not there.
     * WooCommerce writes `date-time` for an ISO 8601 string, `bool` once for a
     * boolean, and `mixed` for a meta value that really can be anything. The first
     * two are typos with an obvious reading. The third is not, so it becomes the
     * union of everything JSON has rather than a guess at which branch is meant.
     *
     * @param array<string, mixed> $schema
     * @return array<string, mixed>|null
     */
    private static function resolveType(array $schema): ?array
    {
        $schema = self::alias($schema);

        // A named reference carries its type from the schema it points at. Keep
        // it intact so SchemaValidator can resolve the target and police the
        // small set of metadata a reference may carry beside it.
        if (isset($schema['$ref'])) {
            return $schema;
        }

        $union  = isset($schema['anyOf']) || isset($schema['oneOf']);

        if (is_array($schema['type'] ?? null)) {
            $members = [];

            foreach ($schema['type'] as $member) {
                if (is_string($member) && $member !== 'null') {
                    $members[] = $member;
                } elseif ($member === 'null') {
                    $schema['nullable'] = true;
                }
            }

            unset($schema['type']);

            if (!$union && count($members) === 1) {
                $schema['type'] = $members[0];
            } elseif (!$union && $members !== []) {
                $schema = self::union($schema, $members);
                $union  = true;
            }
        }

        if ($union) {
            // A union's members carry the types; a sibling "type" would be dropped
            // with a warning when the document is validated.
            unset($schema['type']);

            return $schema;
        }

        $type = $schema['type'] ?? null;

        if (!is_string($type) || !in_array($type, Spec::TYPES, true)) {
            return null;
        }

        return $schema;
    }

    /**
     * Resolve a non-standard type spelling, leaving everything else alone.
     *
     * Only a bare string type is aliased. Inside a type list the same spelling
     * would need the structure keywords redistributed with it, and no WordPress or
     * WooCommerce schema writes one that way.
     *
     * @param array<string, mixed> $schema
     * @return array<string, mixed>
     */
    private static function alias(array $schema): array
    {
        $type = $schema['type'] ?? null;

        if ($type === 'bool') {
            $schema['type'] = 'boolean';

            return $schema;
        }

        if ($type === 'date-time') {
            $schema['type']   = 'string';
            $schema['format'] ??= 'date-time';

            return $schema;
        }

        if ($type === 'mixed' && !isset($schema['anyOf']) && !isset($schema['oneOf'])) {
            unset($schema['type']);

            $schema['anyOf'] = array_map(
                static fn(string $member): array => ['type' => $member],
                self::ANY,
            );
        }

        return $schema;
    }

    /**
     * Spell a type list as a union, keeping each member's structure with it.
     *
     * A shape keyword sits beside the type list rather than inside it, because
     * WordPress has nowhere else to put it: `nav_menu_item.title` is
     * `['string', 'object']` with one `properties` block for the object half. Emit
     * the members as bare types and that block is orphaned — a sibling of a union,
     * which the contract has no reading for, so the generator emits an object with
     * no fields and the described response loses `title.rendered` entirely.
     *
     * So each keyword goes to the member it can mean something for. A keyword no
     * member claims is left where it was, to be reported rather than deleted.
     *
     * @param array<string, mixed> $schema
     * @param array<int, string>   $members
     * @return array<string, mixed>
     */
    private static function union(array $schema, array $members): array
    {
        $shape = [
            'object' => ['properties', 'patternProperties', 'additionalProperties'],
            'array'  => ['items'],
        ];

        $branches = [];
        $claimed  = [];

        foreach ($members as $member) {
            $branch = ['type' => $member];

            foreach ($shape[$member] ?? [] as $keyword) {
                if (array_key_exists($keyword, $schema)) {
                    $branch[$keyword]  = $schema[$keyword];
                    $claimed[$keyword] = true;
                }
            }

            $branches[] = $branch;
        }

        foreach (array_keys($claimed) as $keyword) {
            unset($schema[$keyword]);
        }

        $schema['anyOf'] = $branches;

        return $schema;
    }

    /**
     * A schema or a block of them, as an array, whichever way it was spelled.
     *
     * PHP has one type for a list and a map, so a schema that must serialize as a
     * JSON object rather than `[]` has to be cast to `stdClass` to say so.
     * WooCommerce does exactly that: an `extensions` block nobody has extended is
     * `(object) []`, and treating it as untranslatable failed the cart, the
     * checkout and the product schemas whole, over a field that is empty.
     *
     * @return array<array-key, mixed>|null Null for anything that is not a mapping.
     */
    private static function mapping(mixed $value): ?array
    {
        if ($value instanceof \stdClass) {
            return get_object_vars($value);
        }

        return is_array($value) ? $value : null;
    }

    /**
     * @return array<int, string>
     */
    private static function known(): array
    {
        static $known = null;

        return $known ??= Spec::allKeywords();
    }
}
