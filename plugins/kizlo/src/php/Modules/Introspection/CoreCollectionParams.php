<?php

namespace Kizlo\Modules\Introspection;

use WP_REST_Posts_Controller;
use WP_REST_Terms_Controller;

/**
 * The list parameters a managed route actually honours.
 *
 * `WP_REST_Posts_Controller::get_items()` builds the `$registered` set it gates
 * every filter on from `get_collection_params()`, so that method is the only
 * complete answer to what a managed list accepts. Describing the same surface by
 * hand produced a fork nothing reconciled: seven parameters were honoured and
 * undescribed, and `orderby=menu_order` was described narrowly enough to be
 * rejected on the very types core adds it for.
 *
 * So the contract is derived instead of written. A parameter WordPress adds in a
 * later release, or another plugin adds through
 * `rest_{$post_type}_collection_params`, reaches `/introspect` and the generated
 * client without anyone auditing core again. A hand-written list fails silently
 * when it falls behind; a derived one cannot fall behind at all.
 *
 * Translation is faithful rather than editorial. Nothing the route accepts is
 * dropped for being untidy — only shapes Kizlo spells differently are rewritten,
 * and only a parameter that cannot be expressed at all is dropped, which is
 * reported rather than done quietly.
 */
final class CoreCollectionParams
{
    /** @var array<string, array<string, array<string, mixed>>> */
    private static array $memo = [];

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function forPostType(string $slug): array
    {
        return self::$memo['post_type:' . $slug] ??= self::translate(
            (new WP_REST_Posts_Controller($slug))->get_collection_params(),
            sprintf('/post-types/%s', $slug),
        );
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function forTaxonomy(string $slug): array
    {
        return self::$memo['taxonomy:' . $slug] ??= self::translate(
            (new WP_REST_Terms_Controller($slug))->get_collection_params(),
            sprintf('/taxonomies/%s', $slug),
        );
    }

    /**
     * Memoized because both the runtime registration and the document build ask
     * the same controller the same question, and `get_context_param()` builds the
     * whole item schema to answer it.
     */
    public static function flush(): void
    {
        self::$memo = [];
    }

    // ============================================================
    // INTERNALS
    // ============================================================

    /**
     * Keys are `array-key` rather than `string` because the parameter set passes
     * through `rest_{$type}_collection_params` on its way here, and a filter can
     * return anything.
     *
     * @param array<array-key, mixed> $params
     * @return array<string, array<string, mixed>>
     */
    private static function translate(array $params, string $route): array
    {
        $properties = [];

        foreach ($params as $name => $param) {
            if (!is_string($name) || $name === '') {
                continue;
            }

            $schema = self::schema($param);

            if ($schema === null) {
                // Dropping it silently would recreate the exact defect this class
                // exists to end: a parameter the route honours and the contract
                // never mentions. Core's own parameters all translate, so anything
                // landing here was contributed by a filter outside Kizlo.
                SpecStore::addError(
                    ['path' => $route, 'keyword' => $name],
                    sprintf(
                        'The "%s" collection parameter cannot be expressed as a schema, so the route accepts it undescribed. It was added to WordPress from outside Kizlo.',
                        $name,
                    ),
                );

                continue;
            }

            $properties[$name] = $schema;
        }

        return $properties;
    }

    /**
     * One WordPress argument as a Kizlo schema.
     *
     * Runtime callbacks are kept deliberately. They reach the route through
     * {@see ArgTranslator}, so a derived parameter is validated by the same
     * sanitizer core would have used, and {@see SchemaNormalizer} strips them
     * before the document is emitted.
     *
     * @return array<string, mixed>|null Null when nothing honest can be emitted.
     */
    private static function schema(mixed $param): ?array
    {
        if (!is_array($param)) {
            return null;
        }

        $schema = [];

        foreach ($param as $keyword => $value) {
            // `context` and `arg_options` belong to the item schema, and anything
            // else unrecognized would be dropped with a warning further down.
            if (is_string($keyword) && in_array($keyword, self::known(), true)) {
                $schema[$keyword] = $value;
            }
        }

        $schema = self::resolveType($schema);

        if ($schema === null) {
            return null;
        }

        foreach (['properties', 'patternProperties'] as $keyword) {
            if (!isset($schema[$keyword]) || !is_array($schema[$keyword])) {
                continue;
            }

            $children = [];

            foreach ($schema[$keyword] as $name => $child) {
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
            if (!isset($schema[$keyword]) || !is_array($schema[$keyword])) {
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
     * Rewrite WordPress's type spellings into the two Kizlo has.
     *
     * Core writes a multi-type argument as a list, which the contract does not
     * have. The per-taxonomy filters are `['object', 'array']` beside a `oneOf`
     * naming both shapes, so the list is redundant there and the union carries the
     * meaning. A bare list with no union beside it is still a union, just spelled
     * the other way round, and `['string', 'null']` is what `nullable` means.
     *
     * @param array<string, mixed> $schema
     * @return array<string, mixed>|null
     */
    private static function resolveType(array $schema): ?array
    {
        $union = isset($schema['anyOf']) || isset($schema['oneOf']);

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
                $schema['anyOf'] = array_map(static fn(string $member): array => ['type' => $member], $members);
                $union           = true;
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
     * @return array<int, string>
     */
    private static function known(): array
    {
        static $known = null;

        return $known ??= Spec::allKeywords();
    }
}
