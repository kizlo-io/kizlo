<?php

namespace Kizlo\Modules\Introspection;

/**
 * Errors every operation can return before its own handler is reached.
 *
 * Route declarations name only the errors their handler intentionally returns.
 * This class is the single source for the authentication, permission and
 * argument-validation failures that sit in front of all of them.
 *
 * There are two sets because there are two kinds of operation. A described route
 * is served by WordPress or by another plugin, so only what runs before dispatch
 * applies to it; a route this plugin registers also carries the wrapper Kizlo
 * puts around its own callbacks.
 */
final class OperationErrors
{
    /**
     * What WordPress itself can fail with before any route callback runs.
     *
     * The three `rest_*` codes come from WordPress dispatching and validating
     * arguments, so every described route inherits them whoever owns the route
     * and whether or not the Kizlo guard protects it.
     *
     * @var array<int, string>
     */
    public const NATIVE = [
        'rest_forbidden',
        'rest_invalid_param',
        'rest_missing_callback_param',
    ];

    /**
     * The native set plus the two codes {@see \Kizlo\Modules\RestApi\RestGuard}
     * returns when it protects a route.
     *
     * A described route inherits these only when the guard actually stands in
     * front of it — a Kizlo-owned route, or a family an integration opts in with
     * `kizlo_rest_route_requires_admin` such as the WooCommerce Store API. A
     * native route the guard leaves on its own permissions gets {@see NATIVE}
     * instead, so it never advertises a Kizlo error it can no longer return.
     *
     * @var array<int, string>
     */
    public const GUARD = [
        'kizlo_rest_forbidden',
        'kizlo_rest_unauthorized',
        'rest_forbidden',
        'rest_invalid_param',
        'rest_missing_callback_param',
    ];

    /**
     * The guard set plus the one code only a Kizlo-owned route can produce.
     *
     * {@see RouteRegistrar::routeArgs()} wraps every runtime callback and turns an
     * `InvalidArgumentException` into `invalid_param`. Nothing wraps a route this
     * plugin merely describes, so listing it there would promise a code that
     * route can never return.
     *
     * @var array<int, string>
     */
    public const SHARED = [
        'invalid_param',
        'kizlo_rest_forbidden',
        'kizlo_rest_unauthorized',
        'rest_forbidden',
        'rest_invalid_param',
        'rest_missing_callback_param',
    ];

    /**
     * Add the runtime error set to a route this plugin registers and serves.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    public static function withShared(array $declaration): array
    {
        return self::merge($declaration, self::SHARED);
    }

    /**
     * Add the pre-dispatch set for a described route the Kizlo guard protects.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    public static function withGuard(array $declaration): array
    {
        return self::merge($declaration, self::GUARD);
    }

    /**
     * Add the pre-dispatch set for a described route the Kizlo guard leaves on
     * its own permissions, so it carries only what WordPress can return.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    public static function withNative(array $declaration): array
    {
        return self::merge($declaration, self::NATIVE);
    }

    /**
     * Add the given errors and the responses that carry their WordPress error
     * envelopes without replacing a route's more specific response description.
     *
     * Invalid declarations are left shaped as declared so OperationValidator can
     * report them rather than a merge silently repairing them.
     *
     * @param array<string, mixed> $declaration
     * @param array<int, string>   $shared
     * @return array<string, mixed>
     */
    private static function merge(array $declaration, array $shared): array
    {
        $errors = $declaration['errors'] ?? [];

        if (is_array($errors)) {
            $declaration['errors'] = array_merge($shared, $errors);
        }

        $responses = $declaration['responses'] ?? [];

        if (!is_array($responses)) {
            return $declaration;
        }

        $envelopes = [
            '400' => ['description' => 'The request was invalid.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            '401' => ['description' => 'Authentication is required.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            '403' => ['description' => 'Administrator privileges are required.', 'body' => ['$ref' => CoreSchemas::ERROR]],
        ];

        foreach ($envelopes as $status => $response) {
            if (!array_key_exists($status, $responses)) {
                $responses[$status] = $response;
            }
        }

        $declaration['responses'] = $responses;

        return $declaration;
    }
}
