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
     * What can fail before any route callback runs, whoever owns the route.
     *
     * {@see \Kizlo\Modules\RestApi\RestGuard} runs before route callbacks and
     * protects routes by default, so a described route can answer
     * `kizlo_rest_unauthorized` and `kizlo_rest_forbidden`. Integrations may
     * explicitly leave public routes on native permissions. The three `rest_*`
     * codes come from WordPress dispatching and validating arguments.
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
     * Add the pre-dispatch error set to a route this plugin only describes.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    public static function withGuard(array $declaration): array
    {
        return self::merge($declaration, self::GUARD);
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
