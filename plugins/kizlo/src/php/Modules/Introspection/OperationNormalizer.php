<?php

namespace Kizlo\Modules\Introspection;

/**
 * Turns a flat route declaration into the canonical operation the registry stores.
 *
 * Purely mechanical: uppercase methods, normalize the path, apply content-type
 * defaults, drop the runtime-only callbacks. Nothing here rejects anything —
 * a malformed declaration still normalizes to something shaped, so that
 * {@see OperationValidator} can report every problem at once instead of the
 * first one to blow up.
 */
class OperationNormalizer
{
    /** Methods that carry a request body, and therefore a request content type. */
    public const BODY_METHODS = ['POST', 'PUT', 'PATCH'];

    /**
     * @param array<string, mixed> $raw
     * @return array<string, mixed>
     */
    public static function normalize(array $raw, string $namespace): array
    {
        $route  = is_string($raw['route'] ?? null) ? $raw['route'] : '';
        $parsed = PathNormalizer::normalize($route);

        $methods = self::methods($raw['methods'] ?? null);

        $operation = [
            'api_id'          => is_string($raw['id'] ?? null) ? $raw['id'] : '',
            'namespace'       => $namespace,
            'route'           => $route,
            'path'            => $parsed['path'],
            'path_parameters' => $parsed['parameters'],
            'path_errors'     => $parsed['errors'],
            'operation'       => is_string($raw['operation'] ?? null) ? $raw['operation'] : '',
            'methods'         => $methods,
            'input'           => self::input($raw['input'] ?? null, $methods),
            'responses'       => self::responses($raw['responses'] ?? null),
        ];

        foreach (['summary', 'description'] as $key) {
            if (isset($raw[$key]) && $raw[$key] !== '') {
                $operation[$key] = $raw[$key];
            }
        }

        if (!empty($raw['deprecated'])) {
            $operation['deprecated'] = true;
        }

        return $operation;
    }

    /**
     * The document form of an operation: the registry's bookkeeping keys are
     * internal and never leave the plugin.
     *
     * @param array<string, mixed> $operation
     * @return array<string, mixed>
     */
    public static function toDocument(array $operation): array
    {
        $document = ['methods' => $operation['methods']];

        foreach (['summary', 'description', 'deprecated'] as $key) {
            if (isset($operation[$key])) {
                $document[$key] = $operation[$key];
            }
        }

        $document['input']     = $operation['input'];
        $document['responses'] = $operation['responses'];

        return $document;
    }

    /**
     * The comparison key for merging: two registrations of the same operation may
     * union their methods only when everything else about them is identical.
     *
     * @param array<string, mixed> $operation
     * @return array<string, mixed>
     */
    public static function mergeSignature(array $operation): array
    {
        $signature = self::toDocument($operation);
        unset($signature['methods']);

        return $signature;
    }

    /**
     * @return array<int, string>
     */
    private static function methods(mixed $raw): array
    {
        if (is_string($raw)) {
            $raw = array_map('trim', explode(',', $raw));
        }

        if (!is_array($raw)) {
            return [];
        }

        $methods = [];
        foreach ($raw as $method) {
            if (is_string($method) && $method !== '') {
                $methods[] = strtoupper($method);
            }
        }

        $methods = array_values(array_unique($methods));
        sort($methods);

        return $methods;
    }

    /**
     * @param array<int, string> $methods
     * @return array<string, mixed>
     */
    private static function input(mixed $raw, array $methods): array
    {
        if (!is_array($raw)) {
            return ['type' => 'object', 'properties' => []];
        }

        $input = SchemaNormalizer::normalize($raw);

        if (!isset($input['type'])) {
            $input = ['type' => 'object'] + $input;
        }

        if (self::hasRequestBody($methods) && !isset($input['content_type'])) {
            $input['content_type'] = Spec::JSON_CONTENT_TYPE;
        }

        return $input;
    }

    /**
     * @param array<int, string> $methods
     */
    public static function hasRequestBody(array $methods): bool
    {
        return array_intersect($methods, self::BODY_METHODS) !== [];
    }

    /**
     * @return array<string, mixed>
     */
    private static function responses(mixed $raw): array
    {
        if (!is_array($raw)) {
            return [];
        }

        $responses = [];
        foreach ($raw as $status => $response) {
            $status = (string) $status;

            if (!is_array($response)) {
                $responses[$status] = $response;
                continue;
            }

            $normalized = [];

            if (isset($response['description']) && $response['description'] !== '') {
                $normalized['description'] = $response['description'];
            }

            $hasBody = array_key_exists('body', $response);

            if ($hasBody) {
                $normalized['content_type'] = $response['content_type'] ?? Spec::JSON_CONTENT_TYPE;
            } elseif (isset($response['content_type'])) {
                $normalized['content_type'] = $response['content_type'];
            }

            if (isset($response['headers'])) {
                $normalized['headers'] = is_array($response['headers'])
                    ? SchemaNormalizer::normalize($response['headers'])
                    : $response['headers'];
            }

            if ($hasBody) {
                $normalized['body'] = is_array($response['body'])
                    ? SchemaNormalizer::normalize($response['body'])
                    : $response['body'];
            }

            $responses[$status] = $normalized;
        }

        ksort($responses, SORT_STRING);

        return $responses;
    }
}
