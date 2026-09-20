<?php

namespace Kizlo\Modules\CoreApi;

/**
 * What to call a route nobody named.
 *
 * A hand-declared route states its API ID and operation, because a person wrote
 * it. A discovered one has neither: WordPress registers a path, a method and a
 * callback, and the contract has to invent the two names a generated client is
 * built from. The rules here are the whole of that invention, and they are rules
 * rather than a table so that a route added tomorrow is named the same way.
 *
 * ## Literal segments name the API, parameters never do
 *
 * `/posts` and `/posts/{id}` are one resource; `/posts/{parent}/revisions` is a
 * different one. The difference is the literal segment, so the API ID is every
 * literal in the path, camelized and joined with dots: `posts`, `posts.revisions`,
 * `users.applicationPasswords`, `globalStyles.themes.variations`.
 *
 * This is also what keeps the naming safe. `RouteContractTest` refuses an
 * operation that claims a nested API's member — an API `acme.thing` with an
 * operation `sub` collides with an API `acme.thing.sub`, because both want
 * `client.acme.thing.sub`. Since a literal always becomes part of an API ID and
 * never an operation, the two can never meet.
 *
 * ## The callback names the operation, and the shape is the fallback
 *
 * `WP_REST_Controller` has six conventional method names, and reading them is
 * more reliable than guessing from the HTTP method: `/templates/lookup` is a
 * `GET` with no identifier, which looks like a list and returns one template.
 * When the callback is not one core's own controllers use, the shape decides —
 * a trailing parameter means the route addresses one record, and the method says
 * what it does to it.
 */
final class RouteIdentity
{
    /**
     * Core's own controller method names. Anything else falls to the shape.
     *
     * @var array<string, string>
     */
    private const CALLBACKS = [
        'get_items'           => 'list',
        'get_item'            => 'retrieve',
        'get_current_item'    => 'retrieve',
        'create_item'         => 'create',
        'update_item'         => 'update',
        'update_current_item' => 'update',
        'delete_item'         => 'delete',
        'delete_current_item' => 'delete',
        'delete_items'        => 'delete_all',
    ];

    /** @var array<string, string> */
    private const BY_METHOD = [
        'GET'    => 'list',
        'POST'   => 'create',
        'PUT'    => 'update',
        'PATCH'  => 'update',
        'DELETE' => 'delete_all',
    ];

    /** @var array<string, string> */
    private const BY_METHOD_ON_ITEM = [
        'GET'    => 'retrieve',
        'POST'   => 'update',
        'PUT'    => 'update',
        'PATCH'  => 'update',
        'DELETE' => 'delete',
    ];

    /**
     * The API ID for a path, or null when the path has no literal segment.
     *
     * A namespace root such as `/wp/v2` is the only case: it is the namespace's
     * own index rather than a resource, it has nothing to be named after, and
     * what it returns is the route table itself.
     */
    public static function apiId(string $path): ?string
    {
        $literals = array_values(array_filter(
            explode('/', trim($path, '/')),
            static fn(string $segment): bool => $segment !== '' && !str_starts_with($segment, '{'),
        ));

        if ($literals === []) {
            return null;
        }

        return implode('.', array_map(self::camel(...), $literals));
    }

    /**
     * @param string|null $callback  The controller method serving the route.
     * @param bool        $addresses Whether the path ends in a parameter.
     */
    public static function operation(string $method, ?string $callback, bool $addresses): string
    {
        $operation = self::CALLBACKS[$callback ?? ''] ?? null;

        if ($operation !== null) {
            return $operation;
        }

        return $addresses
            ? self::BY_METHOD_ON_ITEM[$method] ?? strtolower($method)
            : self::BY_METHOD[$method] ?? strtolower($method);
    }

    /**
     * A second route claiming a name the first already took.
     *
     * Core registers `/block-types` and `/block-types/{namespace}` on the same
     * `get_items()`, and `/icons` and `/icons/{collection}` likewise: a
     * collection and the same collection scoped by a parameter. Both are honestly
     * a list of the same resource, so both want `list`, and the scoped one is
     * distinguished by what scopes it.
     */
    public static function scoped(string $operation, string $parameter): string
    {
        return sprintf('%s_by_%s', $operation, self::snake($parameter));
    }

    private static function camel(string $value): string
    {
        $parts = preg_split('/[^a-zA-Z0-9]+/', $value) ?: [];
        $parts = array_values(array_filter($parts, static fn(string $part): bool => $part !== ''));

        if ($parts === []) {
            return $value;
        }

        $head = lcfirst(array_shift($parts));

        return $head . implode('', array_map(ucfirst(...), $parts));
    }

    private static function snake(string $value): string
    {
        $value = preg_replace('/[^a-zA-Z0-9]+/', '_', $value) ?? $value;
        $value = preg_replace('/(?<!^)([A-Z])/', '_$1', $value) ?? $value;

        return strtolower(trim($value, '_'));
    }
}
