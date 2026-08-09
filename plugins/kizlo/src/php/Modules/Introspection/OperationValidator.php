<?php

namespace Kizlo\Modules\Introspection;

/**
 * Checks one normalized operation and returns what is safe to publish.
 *
 * Schema trees go to {@see SchemaValidator}; what lives here is everything about
 * an operation a schema cannot express. A path parameter that is not declared, a
 * `file` outside multipart, a non-JSON body that is not a string, an operation
 * that never succeeds.
 *
 * Almost all of it is fatal to the operation rather than to a keyword: a client
 * method with a missing parameter or no return type is worse than no method at
 * all, so the operation is excluded and reported.
 */
class OperationValidator
{
    public function __construct(
        private SchemaResolver $resolver,
        private Diagnostics $diagnostics,
    ) {}

    /**
     * @param array<string, mixed> $operation
     * @return array<string, mixed>|null Null when the operation cannot be published.
     */
    public function clean(array $operation): ?array
    {
        $location = [
            'api_id'    => (string) $operation['api_id'],
            'path'      => (string) $operation['path'],
            'operation' => (string) $operation['operation'],
        ];

        if (!Spec::isValidApiId($operation['api_id'])) {
            $this->diagnostics->error($location + ['keyword' => 'id'], sprintf('"%s" is not a valid API ID.', (string) $operation['api_id']));
            return null;
        }

        if (!Spec::isValidNamespace($operation['namespace'])) {
            $this->diagnostics->error($location + ['keyword' => 'namespace'], sprintf('"%s" is not a valid REST namespace.', (string) $operation['namespace']));
            return null;
        }

        if (!Spec::isValidOperationName($operation['operation'])) {
            $this->diagnostics->error(
                $location + ['keyword' => 'operation'],
                sprintf('"%s" is not a valid operation name; use lowercase snake_case.', (string) $operation['operation']),
            );
            return null;
        }

        foreach ($operation['path_errors'] as $message) {
            $this->diagnostics->error($location + ['keyword' => 'route'], $message);
        }

        if ($operation['path_errors'] !== []) {
            return null;
        }

        if (!$this->checkMethods($operation, $location)) {
            return null;
        }

        $input = $this->cleanInput($operation, $location);

        if ($input === null) {
            return null;
        }

        $responses = $this->cleanResponses($operation, $location);

        if ($responses === null) {
            return null;
        }

        $operation['input']     = $input;
        $operation['responses'] = $responses;

        return $operation;
    }

    /**
     * @param array<string, mixed>  $operation
     * @param array<string, string> $location
     */
    private function checkMethods(array $operation, array $location): bool
    {
        if ($operation['methods'] === []) {
            $this->diagnostics->error($location + ['keyword' => 'methods'], 'At least one HTTP method is required.');
            return false;
        }

        foreach ($operation['methods'] as $method) {
            if (!in_array($method, Spec::METHODS, true)) {
                $this->diagnostics->error($location + ['keyword' => 'methods'], sprintf('Unknown HTTP method "%s".', $method));
                return false;
            }
        }

        return true;
    }

    /**
     * @param array<string, mixed>  $operation
     * @param array<string, string> $location
     * @return array<string, mixed>|null
     */
    private function cleanInput(array $operation, array $location): ?array
    {
        $input = $operation['input'];

        if (($input['type'] ?? null) !== 'object') {
            $this->diagnostics->error($location + ['keyword' => 'input'], 'Operation input must be an object schema.');
            return null;
        }

        $contentType = $input['content_type'] ?? null;
        $hasBody     = OperationNormalizer::hasRequestBody($operation['methods']);

        if ($contentType !== null && !$hasBody) {
            $this->diagnostics->warning(
                $location + ['keyword' => 'input'],
                'Only an operation with a request body declares "content_type". Ignored.',
            );
            unset($input['content_type']);
            $contentType = null;
        }

        if ($contentType !== null && !in_array($contentType, Spec::REQUEST_CONTENT_TYPES, true)) {
            $this->diagnostics->error(
                $location + ['keyword' => 'input'],
                sprintf('"%s" is not a supported request content type.', is_string($contentType) ? $contentType : gettype($contentType)),
            );
            return null;
        }

        $schema = $input;
        unset($schema['content_type']);

        $cleaned = (new SchemaValidator($this->resolver, $this->diagnostics))->clean($schema, $location, 'input', [
            'file' => $contentType === 'multipart/form-data',
        ]);

        if ($cleaned === null) {
            return null;
        }

        if ($contentType !== null) {
            $cleaned = ['content_type' => $contentType] + $cleaned;
        }

        return $this->markPathParameters($operation, $cleaned, $location);
    }

    /**
     * Every `{parameter}` in the path has to be a declared, required input
     * property, and the ones that are get marked `in: path`.
     *
     * Without the marker a client has to re-derive the URL by matching property
     * names against the path template. With it, `/categories/{category}/products/{slug}`
     * needs no parsing at all. Query versus body stays implied by the method,
     * since WordPress merges every source on the way in anyway.
     *
     * @param array<string, mixed>  $operation
     * @param array<string, mixed>  $input
     * @param array<string, string> $location
     * @return array<string, mixed>|null
     */
    private function markPathParameters(array $operation, array $input, array $location): ?array
    {
        $properties = $input['properties'] ?? [];
        $properties = is_array($properties) ? $properties : [];

        foreach ($operation['path_parameters'] as $parameter) {
            if (!isset($properties[$parameter])) {
                $this->diagnostics->error(
                    $location + ['keyword' => 'input'],
                    sprintf('Path parameter "%s" is not declared in "input.properties".', $parameter),
                );
                return null;
            }

            $property = $properties[$parameter];

            if (!is_array($property) || ($property['required'] ?? false) !== true) {
                $this->diagnostics->error(
                    $location + ['keyword' => 'input', 'pointer' => sprintf('input.properties.%s', $parameter)],
                    sprintf('Path parameter "%s" must be required.', $parameter),
                );
                return null;
            }

            $properties[$parameter] = ['in' => 'path'] + $property;
        }

        if ($properties !== []) {
            $input['properties'] = $properties;
        }

        return $input;
    }

    /**
     * @param array<string, mixed>  $operation
     * @param array<string, string> $location
     * @return array<string, mixed>|null
     */
    private function cleanResponses(array $operation, array $location): ?array
    {
        $responses = $operation['responses'];

        if ($responses === []) {
            $this->diagnostics->error($location + ['keyword' => 'responses'], 'At least one response is required.');
            return null;
        }

        $cleaned    = [];
        $hasSuccess = false;

        foreach ($responses as $status => $response) {
            $status = (string) $status;

            if (!Spec::isValidStatusKey($status)) {
                $this->diagnostics->error(
                    $location + ['keyword' => 'responses'],
                    sprintf('"%s" is not a valid response status; use 200-599 or "default".', $status),
                );
                return null;
            }

            if (!is_array($response)) {
                $this->diagnostics->error($location + ['keyword' => 'responses'], sprintf('Response "%s" must be an array.', $status));
                return null;
            }

            $result = $this->cleanResponse($status, $response, $location);

            if ($result === null) {
                return null;
            }

            if (Spec::isSuccessStatus($status)) {
                $hasSuccess = true;
            }

            $cleaned[$status] = $result;
        }

        if (!$hasSuccess) {
            $this->diagnostics->error($location + ['keyword' => 'responses'], 'No 2xx response declared.');
            return null;
        }

        return $cleaned;
    }

    /**
     * @param array<string, mixed>  $response
     * @param array<string, string> $location
     * @return array<string, mixed>|null
     */
    private function cleanResponse(string $status, array $response, array $location): ?array
    {
        $pointer     = sprintf('responses.%s', $status);
        $contentType = $response['content_type'] ?? null;
        $hasBody     = array_key_exists('body', $response);

        if ($contentType !== null && !in_array($contentType, Spec::RESPONSE_CONTENT_TYPES, true)) {
            $this->diagnostics->error(
                $location + ['pointer' => $pointer, 'keyword' => 'content_type'],
                sprintf('"%s" is not a supported response content type.', is_string($contentType) ? $contentType : gettype($contentType)),
            );
            return null;
        }

        if ($contentType !== null && !$hasBody) {
            $this->diagnostics->warning(
                $location + ['pointer' => $pointer, 'keyword' => 'content_type'],
                'A response without a body does not declare "content_type". Ignored.',
            );
            unset($response['content_type']);
        }

        $validator = new SchemaValidator($this->resolver, $this->diagnostics);

        if (isset($response['headers'])) {
            $headers = $validator->clean($response['headers'], $location, $pointer . '.headers');

            if ($headers === null) {
                return null;
            }

            $response['headers'] = $headers;
        }

        if (!$hasBody) {
            return $response;
        }

        $isBinary = in_array($contentType, Spec::BINARY_CONTENT_TYPES, true);

        $body = $validator->clean($response['body'], $location, $pointer . '.body', ['file' => $isBinary]);

        if ($body === null) {
            return null;
        }

        if (!$this->checkBodyShape($body, (string) $contentType, $location, $pointer)) {
            return null;
        }

        $response['body'] = $body;

        return $response;
    }

    /**
     * @param array<string, mixed>  $body
     * @param array<string, string> $location
     */
    private function checkBodyShape(array $body, string $contentType, array $location, string $pointer): bool
    {
        if ($contentType === Spec::JSON_CONTENT_TYPE) {
            return true;
        }

        $expected = in_array($contentType, Spec::BINARY_CONTENT_TYPES, true) ? 'file' : 'string';

        if (($body['type'] ?? null) !== $expected) {
            $this->diagnostics->error(
                $location + ['pointer' => $pointer . '.body', 'keyword' => 'type'],
                sprintf('A "%s" response body must be of type "%s".', $contentType, $expected),
            );
            return false;
        }

        return true;
    }
}
