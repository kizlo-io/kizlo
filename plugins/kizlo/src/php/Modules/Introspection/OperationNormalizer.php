<?php

namespace Kizlo\Modules\Introspection;

/**
 * Turns a flat route declaration into the canonical operation the registry stores.
 *
 * Purely mechanical: uppercase the method, normalize the path, apply content-type
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

        $method = self::method($raw['method'] ?? null);

        $operation = [
            'api_id'          => is_string($raw['id'] ?? null) ? $raw['id'] : '',
            'namespace'       => $namespace,
            'route'           => $route,
            'path'            => $parsed['path'],
            'path_parameters' => $parsed['parameters'],
            'path_errors'     => $parsed['errors'],
            'operation'       => is_string($raw['operation'] ?? null) ? $raw['operation'] : '',
            'method'          => $method,
            'input'           => self::input($raw['input'] ?? null, $method),
            'errors'          => $raw['errors'] ?? [],
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
        $document = ['method' => $operation['method']];

        foreach (['summary', 'description', 'deprecated'] as $key) {
            if (isset($operation[$key])) {
                $document[$key] = $operation[$key];
            }
        }

        $document['errors']    = $operation['errors'];
        $document['input']     = $operation['input'];
        $document['responses'] = $operation['responses'];

        return $document;
    }

    private static function method(mixed $raw): mixed
    {
        return is_string($raw) ? strtoupper(trim($raw)) : $raw;
    }

    /**
     * @param mixed $method
     * @return array<string, mixed>
     */
    private static function input(mixed $raw, mixed $method): array
    {
        if (!is_array($raw)) {
            return ['type' => 'object', 'properties' => []];
        }

        $input = SchemaNormalizer::normalize($raw);

        if (!isset($input['type'])) {
            $input = ['type' => 'object'] + $input;
        }

        if (self::hasRequestBody($method) && !isset($input['content_type'])) {
            $input['content_type'] = Spec::JSON_CONTENT_TYPE;
        }

        return $input;
    }

    public static function hasRequestBody(mixed $method): bool
    {
        return is_string($method) && in_array($method, self::BODY_METHODS, true);
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

            // Kept only so the validator can explain that error codes belong to
            // the operation. It never survives into a valid document.
            if (array_key_exists('errors', $response)) {
                $normalized['errors'] = $response['errors'];
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
