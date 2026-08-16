<?php

namespace Kizlo\Modules\Introspection;

use WP_REST_Controller;
use WP_REST_Server;

/**
 * What a managed route returns, and what it accepts, read off the controller.
 *
 * {@see CoreCollectionParams} did this for the list. This is the same argument
 * either side of it: the controller {@see CoreControllers} names decides both,
 * through `get_item_schema()` for the response and `get_endpoint_args_for_item_schema()`
 * for the write, so describing either by hand is a second list nothing
 * reconciles. That fork had already opened. `class_list` had been returned since
 * WordPress 6.8 and was described nowhere, `format` was a bare string where core
 * enumerates the registered post formats, and the supports gating disagreed with
 * core outright: core uses a fixed schema for `post`, `page` and `attachment` and
 * ignores their registered supports, so turning off excerpt support removed
 * `excerpt` from the contract while the route kept returning and accepting it.
 *
 * ## One context
 *
 * Core has one item schema and filters the response against it per request, so
 * `?context=edit` returns a different shape from `?context=view`. That is a
 * parameter deciding a type, which the contract cannot express and a generated
 * client cannot use. So Kizlo does not offer it: the API classes pin `edit`
 * before the controller runs and the parameter leaves the contract entirely.
 *
 * `edit` rather than `view` because core's contexts nest, `embed` inside `view`
 * inside `edit`, so pinning the widest one means every field the controller can
 * produce is produced, described, and present on every response. There is no
 * optionality to model and nothing is hidden by omission. Deciding what a caller
 * should see is the job of the extension procedure that returns it, which is the
 * only way out to a browser.
 *
 * Removing the parameter is not enough on its own, which is why it is pinned
 * rather than deleted: `WP_REST_Request` reads query parameters it never
 * registered, and both controllers fall back to `$request['context']`, so an
 * undeclared `?context=view` would still have reshaped the response.
 */
final class CoreItemSchema
{
    /**
     * The context every managed route runs in.
     *
     * @see \Kizlo\Modules\PostType\PostTypeApi
     * @see \Kizlo\Modules\Taxonomy\TaxonomyApi
     */
    public const CONTEXT = 'edit';

    /** @var array<string, array<string, array<string, mixed>>> */
    private static array $memo = [];

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function responseForPostType(string $slug): array
    {
        return self::$memo['post_type:' . $slug] ??= self::response(
            CoreControllers::forPostType($slug),
            sprintf('/post-types/%s', $slug),
        );
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function responseForTaxonomy(string $slug): array
    {
        return self::$memo['taxonomy:' . $slug] ??= self::response(
            CoreControllers::forTaxonomy($slug),
            sprintf('/taxonomies/%s', $slug),
        );
    }

    /**
     * The same derivation for a route that serves a core controller directly.
     *
     * The comment and user routes hand their work to core's own controller and
     * return what it prepares, so the fields they return are the controller's
     * fields and nothing else describes them. `$context` is a parameter because
     * those routes are not managed content: the managed routes pin `edit` before
     * the controller runs, and a route that pins something else has to say so.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function responseForController(WP_REST_Controller $controller, string $route, string $context = self::CONTEXT): array
    {
        return self::$memo[sprintf('controller:%s:%s', $route, $context)] ??= self::response($controller, $route, $context);
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function inputForPostType(string $slug, bool $partial): array
    {
        return self::$memo[sprintf('post_type:%s:%s', $slug, $partial ? 'update' : 'create')] ??= self::input(
            CoreControllers::forPostType($slug),
            $partial,
            sprintf('/post-types/%s', $slug),
        );
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function inputForTaxonomy(string $slug, bool $partial): array
    {
        return self::$memo[sprintf('taxonomy:%s:%s', $slug, $partial ? 'update' : 'create')] ??= self::input(
            CoreControllers::forTaxonomy($slug),
            $partial,
            sprintf('/taxonomies/%s', $slug),
        );
    }

    /**
     * The write surface of a route that serves a core controller directly, taken
     * from the arguments core registers its own write route with.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function inputForController(WP_REST_Controller $controller, bool $partial, string $route): array
    {
        return self::$memo[sprintf('controller:%s:%s', $route, $partial ? 'update' : 'create')] ??= self::input($controller, $partial, $route);
    }

    /**
     * Memoized because the runtime registration and the document build ask the
     * same controller the same question, and a controller rebuilds the whole item
     * schema to answer it.
     */
    public static function flush(): void
    {
        self::$memo = [];
    }

    // ============================================================
    // INTERNALS
    // ============================================================

    /**
     * Every field the route returns, all of them required.
     *
     * `prepare_item_for_response()` populates each schema property
     * unconditionally, gated only on `rest_is_field_included()`, which admits
     * everything when no `_fields` is asked for. So with the context pinned there
     * is no field that sometimes appears, and marking them required says what the
     * response actually is rather than hedging.
     *
     * @return array<string, array<string, mixed>>
     */
    private static function response(WP_REST_Controller $controller, string $route, string $context = self::CONTEXT): array
    {
        $schema     = $controller->get_item_schema();
        $properties = is_array($schema['properties'] ?? null) ? $schema['properties'] : [];

        $translated = CoreSchemaTranslator::properties(
            SpecTranslator::inContext($properties, $context),
            static function (string $name) use ($route): void {
                SpecStore::addError(
                    ['path' => $route, 'keyword' => $name],
                    sprintf(
                        'The "%s" response field cannot be expressed as a schema, so the route returns it undescribed. It was added to WordPress from outside Kizlo.',
                        $name,
                    ),
                );
            },
        );

        return SpecTranslator::required(array_map(self::written(...), $translated));
    }

    /**
     * The one shape a response field is actually written in.
     *
     * Core keeps one schema per field and lets it describe both directions, so a
     * field a caller may *send* two ways is declared with two types even when only
     * one of them is ever *returned*. `nav_menu_item.title` is the case on these
     * routes: `['string', 'object']`, because a create accepts a bare string, while
     * `prepare_item_for_response()` assigns `$data['title'] = array()` and fills it
     * unconditionally. A response is whatever that method wrote, so describing it
     * as a union would publish a branch no response can take, and every reader
     * would have to narrow past it to reach `title.rendered`.
     *
     * Narrow only when it is unambiguous: exactly one branch carries structure and
     * the rest are bare scalars. Two structured branches is a field that genuinely
     * varies, and that stays a union.
     *
     * {@see eitherForm()} is the mirror image, widening the same field on the way
     * in for the same reason.
     *
     * @param array<string, mixed> $property
     * @return array<string, mixed>
     */
    private static function written(array $property): array
    {
        $union = $property['anyOf'] ?? null;

        if (is_array($union)) {
            $structured = array_values(array_filter(
                $union,
                static fn(mixed $member): bool => is_array($member) && (isset($member['properties']) || isset($member['items'])),
            ));

            if (count($structured) === 1) {
                unset($property['anyOf']);
                /** @var array<string, mixed> $property */
                $property = $structured[0] + $property;
            }
        }

        if (isset($property['properties']) && is_array($property['properties'])) {
            $property['properties'] = array_map(
                static fn(mixed $child): mixed => is_array($child) ? self::written($child) : $child,
                $property['properties'],
            );
        }

        return $property;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function input(WP_REST_Controller $controller, bool $partial, string $route): array
    {
        $args = $controller->get_endpoint_args_for_item_schema(
            $partial ? WP_REST_Server::EDITABLE : WP_REST_Server::CREATABLE,
        );

        $unvalidated = self::unvalidated($args);

        $properties = CoreSchemaTranslator::properties(
            $args,
            static function (string $name) use ($route): void {
                SpecStore::addError(
                    ['path' => $route, 'keyword' => $name],
                    sprintf(
                        'The "%s" input property cannot be expressed as a schema, so the route accepts it undescribed. It was added to WordPress from outside Kizlo.',
                        $name,
                    ),
                );
            },
        );

        foreach ($properties as $name => $property) {
            $properties[$name] = in_array($name, $unvalidated, true)
                ? self::eitherForm($property)
                : self::withoutNullCallbacks($property);
        }

        return $properties;
    }

    /**
     * Properties whose `arg_options` switch WordPress's own validation off.
     *
     * `rest_get_endpoint_args_for_schema()` merges `arg_options` over the
     * defaults, so a core field that sanitizes itself inside
     * `prepare_item_for_database()` arrives here with a null `validate_callback`.
     * That is not a detail: it is the reason those fields accept a bare string as
     * well as the `{ raw }` object their schema describes.
     *
     * @param array<array-key, mixed> $args
     * @return array<int, string>
     */
    private static function unvalidated(array $args): array
    {
        $names = [];

        foreach ($args as $name => $arg) {
            if (!is_string($name) || !is_array($arg)) {
                continue;
            }

            if (array_key_exists('validate_callback', $arg) && $arg['validate_callback'] === null) {
                $names[] = $name;
            }
        }

        return $names;
    }

    /**
     * Both forms an unvalidated text field accepts.
     *
     * Only the writable half of the object survives: core leaves `rendered` and
     * `block_version` in the argument's nested properties even though they are
     * `readonly`, because `rest_get_endpoint_args_for_schema()` only strips
     * readonly at the top level.
     *
     * @param array<string, mixed> $property
     * @return array<string, mixed>
     */
    private static function eitherForm(array $property): array
    {
        $raw = $property['properties']['raw'] ?? null;

        if (($property['type'] ?? null) !== 'object' || !is_array($raw)) {
            return self::withoutNullCallbacks($property);
        }

        $union = ['anyOf' => [
            ['type' => 'string'],
            ['type' => 'object', 'properties' => ['raw' => $raw + ['required' => true]]],
        ]];

        if (isset($property['description'])) {
            $union = ['description' => $property['description']] + $union;
        }

        return $union;
    }

    /**
     * A null callback means "WordPress does nothing here", which is not something
     * to carry into a registered schema: {@see ArgTranslator} would read the null
     * as absent and substitute the default anyway.
     *
     * @param array<string, mixed> $property
     * @return array<string, mixed>
     */
    private static function withoutNullCallbacks(array $property): array
    {
        foreach (Spec::RUNTIME_KEYWORDS as $keyword) {
            if (array_key_exists($keyword, $property) && $property[$keyword] === null) {
                unset($property[$keyword]);
            }
        }

        return $property;
    }

}
