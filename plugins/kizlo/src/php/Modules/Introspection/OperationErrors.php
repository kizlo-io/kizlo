<?php

namespace Kizlo\Modules\Introspection;

/**
 * Runtime errors added before or around every Kizlo-owned route callback.
 *
 * Route declarations name only the errors their handler intentionally returns.
 * This class is the single source for authentication, permission, argument
 * validation and callback-wrapper failures shared by every runtime operation.
 */
final class OperationErrors
{
    /** @var array<int, string> */
    public const SHARED = [
        'invalid_param',
        'kizlo_rest_forbidden',
        'kizlo_rest_unauthorized',
        'rest_forbidden',
        'rest_invalid_param',
        'rest_missing_callback_param',
    ];

    /**
     * Add the shared errors and the responses that carry their WordPress error
     * envelopes without replacing a route's more specific response description.
     *
     * Invalid declarations are left shaped as declared so OperationValidator can
     * report them rather than a merge silently repairing them.
     *
     * @param array<string, mixed> $declaration
     * @return array<string, mixed>
     */
    public static function withShared(array $declaration): array
    {
        $errors = $declaration['errors'] ?? [];

        if (is_array($errors)) {
            $declaration['errors'] = array_merge(self::SHARED, $errors);
        }

        $responses = $declaration['responses'] ?? [];

        if (!is_array($responses)) {
            return $declaration;
        }

        $shared = [
            '400' => ['description' => 'The request was invalid.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            '401' => ['description' => 'Authentication is required.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            '403' => ['description' => 'Administrator privileges are required.', 'body' => ['$ref' => CoreSchemas::ERROR]],
        ];

        foreach ($shared as $status => $response) {
            if (!array_key_exists($status, $responses)) {
                $responses[$status] = $response;
            }
        }

        $declaration['responses'] = $responses;

        return $declaration;
    }
}
