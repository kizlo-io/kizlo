<?php

namespace Kizlo\Modules\Introspection;

use WP_REST_Controller;

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
 * Translation is faithful rather than editorial, and {@see CoreSchemaTranslator}
 * does it. Nothing the route accepts is dropped for being untidy, and only a
 * parameter that cannot be expressed at all is dropped, which is reported rather
 * than done quietly.
 *
 * `context` is the one exception, and it is removed from the route rather than
 * only from the contract. {@see \Kizlo\Modules\PostType\PostTypeApi} pins it to
 * `edit` before the controller runs, so no caller can change the shape of a
 * response, and describing a parameter that is overwritten on arrival would be a
 * lie in the other direction.
 *
 * `status` is where that rule costs something visible. Core builds its list enum
 * from `array_keys( get_post_stati() )`, and `register_post_status()` takes no
 * post type, so WooCommerce registering `wc-processing` puts it in the enum for
 * `post`, `page` and every other type too. Nothing native separates a type's own
 * statuses from another's, not even the `internal` flag, which WooCommerce's
 * `'public' => false` already clears, because WordPress does not model that
 * relationship at all. Any filter here would be a guess, and a wrong guess drops
 * a status the route honours, which is the defect this class exists to end. So
 * the enum is emitted whole and reads noisily; narrowing it for display is the
 * generator's problem, not the contract's.
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
            CoreControllers::forPostType($slug)->get_collection_params(),
            sprintf('/post-types/%s', $slug),
        );
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function forTaxonomy(string $slug): array
    {
        return self::$memo['taxonomy:' . $slug] ??= self::translate(
            CoreControllers::forTaxonomy($slug)->get_collection_params(),
            sprintf('/taxonomies/%s', $slug),
        );
    }

    /**
     * The same derivation for a list this plugin describes but does not serve.
     *
     * The argument is unchanged: `get_collection_params()` is what the controller
     * builds its `$registered` set from, so it is the only complete answer to what
     * the list accepts. That a core route rather than a managed one is being
     * described changes nothing about where the answer comes from.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function forController(WP_REST_Controller $controller, string $route): array
    {
        return self::$memo['controller:' . $route] ??= self::translate($controller->get_collection_params(), $route);
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
     * @param array<array-key, mixed> $params
     * @return array<string, array<string, mixed>>
     */
    private static function translate(array $params, string $route): array
    {
        unset($params['context']);

        return CoreSchemaTranslator::properties(
            $params,
            static function (string $name) use ($route): void {
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
            },
        );
    }
}
