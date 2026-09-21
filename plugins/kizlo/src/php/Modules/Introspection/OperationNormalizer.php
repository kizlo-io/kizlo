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

    /** The parts a request is described in. */
    public const PARTS = ['params', 'query', 'body'];

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
            'input'           => self::input($raw['input'] ?? null, $method, $parsed['parameters']),
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
     * The request in its three parts: `params`, `query`, `body`.
     *
     * A declaration may already be written that way, which is the only way to
     * describe a body that is not an object or a body method that also takes
     * query parameters. A flat declaration is still accepted and split here, so
     * every route registered against the older shape keeps producing exactly
     * the operation it produced before: the path captures become `params`, and
     * whatever is left is the body on a body method and the query otherwise.
     *
     * @param mixed         $method
     * @param array<string> $pathParameters
     * @return array<string, mixed>
     */
    private static function input(mixed $raw, mixed $method, array $pathParameters): array
    {
        if (!is_array($raw)) {
            return self::hasRequestBody($method) ? ['body' => self::emptyBody()] : [];
        }

        return self::isSeparated($raw)
            ? self::separated($raw, $method)
            : self::split(SchemaNormalizer::normalize($raw), $method, $pathParameters);
    }

    /**
     * Which shape the declaration is written in. The parts are reserved names at
     * this level, and a flat schema is recognised by the keywords that describe
     * an object rather than by what its properties happen to be called.
     *
     * @param array<string, mixed> $raw
     */
    public static function isSeparated(array $raw): bool
    {
        if (isset($raw['type']) || isset($raw['properties']) || isset($raw['$ref']) || isset($raw['$extends'])) {
            return false;
        }

        foreach (self::PARTS as $part) {
            if (array_key_exists($part, $raw)) {
                return true;
            }
        }

        return false;
    }

    /**
     * The parts merged back into the one object schema the WordPress runtime
     * wants, because `WP_REST_Request` reads path, query, and body through a
     * single `args` map and does not care which one a value arrived on.
     *
     * Describing a route and serving it are different jobs: the contract keeps
     * the parts apart so a client can build the request, and this puts them back
     * together so WordPress can validate it.
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public static function flatten(array $input): array
    {
        if (!self::isSeparated($input)) {
            return $input;
        }

        $flat       = ['type' => 'object'];
        $properties = [];

        foreach (self::PARTS as $part) {
            $group = $input[$part] ?? null;

            if (!is_array($group)) {
                continue;
            }

            if (is_array($group['properties'] ?? null)) {
                $properties += $group['properties'];
            }

            foreach ($group as $keyword => $value) {
                if (in_array($keyword, ['type', 'properties', 'content_type'], true) || array_key_exists($keyword, $flat)) {
                    continue;
                }

                $flat[$keyword] = $value;
            }
        }

        if ($properties !== []) {
            $flat['properties'] = $properties;
        }

        if (is_array($input['body'] ?? null) && isset($input['body']['content_type'])) {
            $flat['content_type'] = $input['body']['content_type'];
        }

        return $flat;
    }

    /**
     * @param array<string, mixed> $raw
     * @param mixed                $method
     * @return array<string, mixed>
     */
    private static function separated(array $raw, mixed $method): array
    {
        $input = [];

        foreach (['params', 'query'] as $part) {
            if (!is_array($raw[$part] ?? null)) {
                continue;
            }

            $group = SchemaNormalizer::normalize($raw[$part]);

            if (!isset($group['type'])) {
                $group = ['type' => 'object'] + $group;
            }

            $input[$part] = $group;
        }

        if (array_key_exists('body', $raw)) {
            $body = is_array($raw['body']) ? SchemaNormalizer::normalize($raw['body']) : $raw['body'];

            if (is_array($body) && self::hasRequestBody($method) && !isset($body['content_type'])) {
                $body['content_type'] = Spec::JSON_CONTENT_TYPE;
            }

            $input['body'] = $body;
        } elseif (self::hasRequestBody($method)) {
            $input['body'] = self::emptyBody();
        }

        return $input;
    }

    /**
     * Split one flat object schema into the parts it was always describing.
     *
     * Only the path captures move: everything else stays in the schema it was
     * declared in, keywords and all, so a declaration carrying `$extends` or
     * `additionalProperties` rather than plain properties survives intact.
     *
     * @param array<string, mixed> $flat
     * @param mixed                $method
     * @param array<string>        $pathParameters
     * @return array<string, mixed>
     */
    private static function split(array $flat, mixed $method, array $pathParameters): array
    {
        if (!isset($flat['type'])) {
            $flat = ['type' => 'object'] + $flat;
        }

        $contentType = $flat['content_type'] ?? null;
        unset($flat['content_type']);

        $properties = is_array($flat['properties'] ?? null) ? $flat['properties'] : [];
        $params     = [];

        foreach ($pathParameters as $parameter) {
            if (array_key_exists($parameter, $properties)) {
                $params[$parameter] = $properties[$parameter];
                unset($properties[$parameter]);
            }
        }

        if ($properties !== []) {
            $flat['properties'] = $properties;
        } else {
            unset($flat['properties']);
        }

        $input = [];

        if ($params !== []) {
            $input['params'] = ['type' => 'object', 'properties' => $params];
        }

        if (self::hasRequestBody($method)) {
            $flat['content_type'] = is_string($contentType) ? $contentType : Spec::JSON_CONTENT_TYPE;
            $input['body']        = $flat;
        } elseif ($contentType !== null) {
            // Carried rather than dropped, so the validator can say it means nothing here.
            $flat['content_type'] = $contentType;
            $input['query']       = $flat;
        } elseif ($flat !== ['type' => 'object']) {
            $input['query'] = $flat;
        }

        return $input;
    }

    /**
     * A body method always declares a body, even when it takes no fields: the
     * request still carries `{}`, and the content type still has to be named.
     *
     * @return array<string, mixed>
     */
    private static function emptyBody(): array
    {
        return ['type' => 'object', 'content_type' => Spec::JSON_CONTENT_TYPE];
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
