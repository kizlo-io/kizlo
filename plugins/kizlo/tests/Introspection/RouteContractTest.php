<?php

namespace Kizlo\Tests\Introspection;

/**
 * The route half of the contract: identifiers, paths, method, content types,
 * responses, and how repeated registrations merge or conflict.
 */
class RouteContractTest extends IntrospectionTestCase
{
    /**
     * @return array<int, array<string, string>>
     */
    private function widgetErrors(): array
    {
        return $this->errorsFor($this->errors(), 'api_id', 'acme.widgets');
    }

    // ============================================================
    // PATHS
    // ============================================================

    public function test_a_named_regex_parameter_normalizes_to_a_readable_path(): void
    {
        kizlo_register_spec_route($this->operation([
            'operation' => 'retrieve',
            'route'     => kizlo_route('/widgets/:id'),
            'input'     => ['type' => 'object', 'properties' => ['id' => ['type' => 'string', 'required' => true]]],
            'responses' => ['200' => ['body' => ['type' => 'string']]],
        ]));

        $paths = $this->document()['apis']['acme.widgets']['paths'];

        $this->assertSame(['/widgets/{id}'], array_keys($paths));
    }

    public function test_a_path_parameter_must_be_declared_in_the_input(): void
    {
        kizlo_register_spec_route($this->operation([
            'operation' => 'retrieve',
            'route'     => kizlo_route('/widgets/:id'),
            'responses' => ['200' => ['body' => ['type' => 'string']]],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'Path parameter "id" is not declared in "input.properties"');
    }

    public function test_a_path_parameter_must_be_required(): void
    {
        kizlo_register_spec_route($this->operation([
            'operation' => 'retrieve',
            'route'     => kizlo_route('/widgets/:id'),
            'input'     => ['type' => 'object', 'properties' => ['id' => ['type' => 'string']]],
            'responses' => ['200' => ['body' => ['type' => 'string']]],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'Path parameter "id" must be required');
    }

    public function test_a_path_parameter_keeps_its_declared_type_rather_than_the_regexs(): void
    {
        kizlo_register_spec_route($this->operation([
            'operation' => 'retrieve',
            'route'     => '/widgets/(?P<identifier>\d+)',
            'input'     => [
                'type'       => 'object',
                'properties' => ['identifier' => ['type' => 'string', 'required' => true]],
            ],
            'responses' => ['200' => ['body' => ['type' => 'string']]],
        ]));

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets/{identifier}']['retrieve'];

        $this->assertSame('string', $operation['input']['properties']['identifier']['type']);
    }

    public function test_an_unnamed_group_in_a_route_fails_introspection(): void
    {
        kizlo_register_spec_route($this->operation(['route' => '/widgets/(\d+)']));

        $this->assertErrorContains($this->widgetErrors(), 'unnamed group');
    }

    public function test_a_route_must_start_with_a_slash(): void
    {
        kizlo_register_spec_route($this->operation(['route' => 'widgets']));

        $this->assertErrorContains($this->widgetErrors(), 'Route must start with "/"');
    }

    // ============================================================
    // IDENTIFIERS AND METHOD
    // ============================================================

    public function test_an_operation_name_must_be_lowercase_snake_case(): void
    {
        kizlo_register_spec_route($this->operation(['operation' => 'listAll']));

        $this->assertErrorContains($this->widgetErrors(), 'use lowercase snake_case');
    }

    public function test_a_non_crud_snake_case_operation_name_is_allowed(): void
    {
        kizlo_register_spec_route($this->operation(['operation' => 'bulk_archive', 'method' => 'POST']));

        $paths = $this->document()['apis']['acme.widgets']['paths'];

        $this->assertArrayHasKey('bulk_archive', $paths['/widgets']);
    }

    public function test_a_method_is_uppercased(): void
    {
        kizlo_register_spec_route($this->operation(['operation' => 'update', 'method' => 'put']));

        $this->assertSame('PUT', $this->document()['apis']['acme.widgets']['paths']['/widgets']['update']['method']);
    }

    public function test_a_method_is_required(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_spec_route');

        kizlo_register_spec_route($this->operation(['method' => null]));

        $this->assertErrorContains($this->widgetErrors(), '"method" is required');
    }

    public function test_the_plural_methods_key_is_rejected(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_spec_route');

        $operation = $this->operation();
        unset($operation['method']);
        $operation['methods'] = ['GET'];

        kizlo_register_spec_route($operation);

        $this->assertErrorContains($this->widgetErrors(), '"methods" is not supported');
    }

    public function test_a_method_cannot_be_an_array(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_spec_route');

        foreach ([['GET'], ['GET', 'POST']] as $methods) {
            kizlo_register_spec_route($this->operation([
                'operation' => sprintf('array_%d', count($methods)),
                'method'    => $methods,
            ]));
        }

        $errors = $this->widgetErrors();

        $this->assertCount(2, $errors);
        $this->assertErrorContains($errors, 'arrays are not supported');
    }

    public function test_a_contributed_method_cannot_be_an_array(): void
    {
        add_filter('kizlo_introspection_routes', function (array $routes): array {
            $routes[] = $this->operation(['method' => ['GET']]);
            return $routes;
        });

        $this->assertErrorContains($this->widgetErrors(), 'arrays are not supported');
    }

    public function test_an_unknown_http_method_fails_introspection(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_spec_route');

        kizlo_register_spec_route($this->operation(['method' => 'FETCH']));

        $this->assertErrorContains($this->widgetErrors(), 'Unknown HTTP method "FETCH"');
    }

    public function test_an_invalid_namespace_fails_introspection(): void
    {
        kizlo_register_spec_route($this->operation(['namespace' => 'acme']));

        $this->assertErrorContains($this->widgetErrors(), 'is not a valid REST namespace');
    }

    public function test_one_api_cannot_be_declared_under_two_namespaces(): void
    {
        kizlo_register_spec_route($this->operation());
        kizlo_register_spec_route($this->operation(['namespace' => 'acme/v2', 'route' => '/others']));

        $this->assertErrorContains($this->errors(), 'one API has one namespace');
    }

    // ============================================================
    // CONTENT TYPES
    // ============================================================

    public function test_a_request_body_defaults_to_json(): void
    {
        kizlo_register_spec_route($this->operation([
            'operation' => 'create',
            'method'    => 'POST',
            'responses' => ['201' => ['body' => ['type' => 'string']]],
        ]));

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['create'];

        $this->assertSame('application/json', $operation['input']['content_type']);
    }

    public function test_an_operation_without_a_body_carries_no_request_content_type(): void
    {
        kizlo_register_spec_route($this->operation());

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['list'];

        $this->assertArrayNotHasKey('content_type', $operation['input']);
    }

    public function test_declaring_a_request_content_type_without_a_body_fails(): void
    {
        kizlo_register_spec_route($this->operation([
            'input' => ['type' => 'object', 'content_type' => 'application/json', 'properties' => []],
        ]));

        $this->assertErrorContains($this->warnings(), 'Only an operation with a request body declares "content_type"');
    }

    public function test_an_unsupported_request_content_type_fails(): void
    {
        kizlo_register_spec_route($this->operation([
            'operation' => 'create',
            'method'    => 'POST',
            'input'     => ['type' => 'object', 'content_type' => 'application/yaml', 'properties' => []],
            'responses' => ['201' => ['body' => ['type' => 'string']]],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'is not a supported request content type');
    }

    public function test_a_file_property_is_allowed_under_multipart(): void
    {
        kizlo_register_spec_route($this->operation([
            'operation' => 'create',
            'method'    => 'POST',
            'input'     => [
                'type'         => 'object',
                'content_type' => 'multipart/form-data',
                'properties'   => ['upload' => ['type' => 'file', 'required' => true]],
            ],
            'responses' => ['201' => ['body' => ['type' => 'string']]],
        ]));

        $this->assertSame([], $this->errors(), 'Expected a clean contract.');
    }

    public function test_a_file_property_is_rejected_under_json(): void
    {
        kizlo_register_spec_route($this->operation([
            'operation' => 'create',
            'method'    => 'POST',
            'input'     => ['type' => 'object', 'properties' => ['upload' => ['type' => 'file']]],
            'responses' => ['201' => ['body' => ['type' => 'string']]],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'only valid under a multipart/form-data request body');
    }

    public function test_a_response_content_type_defaults_to_json(): void
    {
        kizlo_register_spec_route($this->operation());

        $response = $this->document()['apis']['acme.widgets']['paths']['/widgets']['list']['responses'][200];

        $this->assertSame('application/json', $response['content_type']);
    }

    public function test_responses_on_one_operation_may_use_different_content_types(): void
    {
        kizlo_register_spec_route($this->operation([
            'responses' => [
                '200' => ['content_type' => 'text/csv', 'body' => ['type' => 'string']],
                '500' => ['body' => ['$ref' => 'kizlo.error']],
            ],
        ]));

        $responses = $this->document()['apis']['acme.widgets']['paths']['/widgets']['list']['responses'];

        $this->assertSame('text/csv', $responses[200]['content_type']);
        $this->assertSame('application/json', $responses[500]['content_type']);
    }

    public function test_a_text_response_body_must_be_a_string(): void
    {
        kizlo_register_spec_route($this->operation([
            'responses' => ['200' => ['content_type' => 'text/plain', 'body' => ['type' => 'object', 'properties' => []]]],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'A "text/plain" response body must be of type "string"');
    }

    public function test_a_binary_response_body_must_be_a_file(): void
    {
        kizlo_register_spec_route($this->operation([
            'responses' => ['200' => ['content_type' => 'application/octet-stream', 'body' => ['type' => 'string']]],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'must be of type "file"');
    }

    public function test_a_binary_response_body_may_be_a_file(): void
    {
        kizlo_register_spec_route($this->operation([
            'responses' => ['200' => ['content_type' => 'application/octet-stream', 'body' => ['type' => 'file']]],
        ]));

        $this->assertSame([], $this->errors(), 'Expected a clean contract.');
    }

    public function test_a_no_content_response_carries_no_content_type(): void
    {
        kizlo_register_spec_route($this->operation([
            'operation' => 'delete',
            'method'    => 'DELETE',
            'responses' => ['204' => ['description' => 'Deleted.']],
        ]));

        $response = $this->document()['apis']['acme.widgets']['paths']['/widgets']['delete']['responses'][204];

        $this->assertArrayNotHasKey('content_type', $response);
        $this->assertArrayNotHasKey('body', $response);
    }

    // ============================================================
    // RESPONSES
    // ============================================================

    public function test_an_operation_needs_a_successful_response(): void
    {
        kizlo_register_spec_route($this->operation([
            'responses' => ['404' => ['body' => ['$ref' => 'kizlo.error']]],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'No 2xx response declared');
    }

    public function test_an_invalid_status_key_fails_introspection(): void
    {
        kizlo_register_spec_route($this->operation([
            'responses' => ['200' => ['body' => ['type' => 'string']], '99' => ['body' => ['type' => 'string']]],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'is not a valid response status');
    }

    public function test_a_default_response_key_is_accepted(): void
    {
        kizlo_register_spec_route($this->operation([
            'responses' => [
                '200'     => ['body' => ['type' => 'string']],
                'default' => ['body' => ['$ref' => 'kizlo.error']],
            ],
        ]));

        $responses = $this->document()['apis']['acme.widgets']['paths']['/widgets']['list']['responses'];

        $this->assertArrayHasKey('default', $responses);
    }

    public function test_response_headers_are_validated_and_emitted(): void
    {
        kizlo_register_spec_route($this->operation([
            'responses' => [
                '200' => [
                    'headers' => [
                        'type'       => 'object',
                        'properties' => ['X-WP-Total' => ['type' => 'integer', 'required' => true]],
                    ],
                    'body'    => ['type' => 'array', 'items' => ['type' => 'string']],
                ],
            ],
        ]));

        $response = $this->document()['apis']['acme.widgets']['paths']['/widgets']['list']['responses'][200];

        $this->assertTrue($response['headers']['properties']['X-WP-Total']['required']);
    }

    // ============================================================
    // ERRORS
    // ============================================================

    public function test_operation_errors_are_sorted_before_emission(): void
    {
        kizlo_register_spec_route($this->operation([
            'errors'    => ['widget_unavailable', 'invalid_widget'],
            'responses' => [
                '200' => ['body' => ['type' => 'string']],
                '400' => ['body' => ['$ref' => 'kizlo.error']],
            ],
        ]));

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['list'];

        $this->assertSame(['invalid_widget', 'widget_unavailable'], $operation['errors']);
    }

    public function test_duplicate_operation_errors_fail_introspection(): void
    {
        kizlo_register_spec_route($this->operation([
            'errors'    => ['invalid_widget', 'invalid_widget'],
            'responses' => [
                '200' => ['body' => ['type' => 'string']],
                '400' => ['body' => ['$ref' => 'kizlo.error']],
            ],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'declared more than once');
    }

    /**
     * @dataProvider invalidErrorsProvider
     */
    public function test_operation_errors_must_be_a_list_of_non_empty_strings(mixed $errors): void
    {
        kizlo_register_spec_route($this->operation([
            'errors'    => $errors,
            'responses' => [
                '200' => ['body' => ['type' => 'string']],
                '400' => ['body' => ['$ref' => 'kizlo.error']],
            ],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'non-empty string');
    }

    /**
     * @return array<string, array{mixed}>
     */
    public static function invalidErrorsProvider(): array
    {
        return [
            'not an array'   => ['invalid_widget'],
            'not a list'     => [['code' => 'invalid_widget']],
            'empty code'     => [['']],
            'whitespace code' => [['   ']],
            'non-string code' => [[400]],
        ];
    }

    public function test_operation_errors_need_a_non_success_json_error_response(): void
    {
        kizlo_register_spec_route($this->operation(['errors' => ['invalid_widget']]));

        $this->assertErrorContains($this->widgetErrors(), 'must declare a non-2xx JSON response');
    }

    public function test_operation_errors_need_the_wordpress_error_envelope(): void
    {
        kizlo_register_spec_route($this->operation([
            'errors'    => ['invalid_widget'],
            'responses' => [
                '200' => ['body' => ['type' => 'string']],
                '400' => ['body' => ['type' => 'string']],
            ],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'using the "kizlo.error" body');
    }

    public function test_operation_errors_need_a_json_error_response(): void
    {
        kizlo_register_spec_route($this->operation([
            'errors'    => ['invalid_widget'],
            'responses' => [
                '200' => ['body' => ['type' => 'string']],
                '400' => ['content_type' => 'text/plain', 'body' => ['type' => 'string']],
            ],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'must declare a non-2xx JSON response');
    }

    public function test_errors_cannot_be_declared_on_an_individual_response(): void
    {
        kizlo_register_spec_route($this->operation([
            'responses' => [
                '200' => ['body' => ['type' => 'string']],
                '400' => ['errors' => ['invalid_widget'], 'body' => ['$ref' => 'kizlo.error']],
            ],
        ]));

        $this->assertErrorContains($this->widgetErrors(), 'belongs to the operation');
    }

    // ============================================================
    // MERGING AND CONFLICTS
    // ============================================================

    public function test_identical_operations_merge(): void
    {
        kizlo_register_spec_route($this->operation(['operation' => 'update', 'method' => 'PUT']));
        kizlo_register_spec_route($this->operation(['operation' => 'update', 'method' => 'PUT']));

        $this->assertSame('PUT', $this->document()['apis']['acme.widgets']['paths']['/widgets']['update']['method']);
    }

    public function test_the_same_operation_declared_twice_differently_fails(): void
    {
        kizlo_register_spec_route($this->operation());
        kizlo_register_spec_route($this->operation([
            'responses' => ['200' => ['body' => ['type' => 'string']]],
        ]));

        $this->assertErrorContains($this->errors(), 'Declared twice with a different method, input, errors or responses');
    }

    public function test_an_operation_name_is_unique_across_the_whole_api(): void
    {
        // The name becomes a method on the generated client, so two paths both
        // called "list" would leave it with two list() methods and no way to pick.
        kizlo_register_spec_route($this->operation(['route' => '/widgets']));
        kizlo_register_spec_route($this->operation(['route' => '/gadgets']));

        $errors = $this->widgetErrors();

        $this->assertErrorContains($errors, 'an operation name is a method name, so it is unique per API');
        $this->assertSame('operation', $errors[0]['data']['keyword']);
    }

    public function test_the_same_operation_name_may_be_reused_by_a_different_api(): void
    {
        kizlo_register_spec_route($this->operation(['route' => '/widgets']));
        kizlo_register_spec_route($this->operation(['id' => 'acme.gadgets', 'route' => '/gadgets']));

        $apis = $this->document()['apis'];

        $this->assertArrayHasKey('list', $apis['acme.widgets']['paths']['/widgets']);
        $this->assertArrayHasKey('list', $apis['acme.gadgets']['paths']['/gadgets']);
    }

    public function test_one_operation_name_cannot_be_split_across_methods(): void
    {
        kizlo_register_spec_route($this->operation(['operation' => 'update', 'method' => 'PUT']));
        kizlo_register_spec_route($this->operation(['operation' => 'update', 'method' => 'PATCH']));

        $this->assertErrorContains($this->errors(), 'Declared twice with a different method');
    }

    public function test_two_operations_cannot_claim_the_same_method_on_one_path(): void
    {
        kizlo_register_spec_route($this->operation());
        kizlo_register_spec_route($this->operation(['operation' => 'search']));

        $this->assertErrorContains($this->errors(), 'is already handled by the');
    }

    public function test_identical_schema_registrations_merge(): void
    {
        $schema = ['type' => 'object', 'properties' => ['id' => ['type' => 'integer']]];

        kizlo_register_spec_schema('acme.widget', $schema);
        kizlo_register_spec_schema('acme.widget', $schema);

        $this->assertArrayHasKey('acme.widget', $this->document()['schemas']);
    }

    public function test_conflicting_schema_registrations_fail(): void
    {
        kizlo_register_spec_schema('acme.widget', ['type' => 'object', 'properties' => ['id' => ['type' => 'integer']]]);
        kizlo_register_spec_schema('acme.widget', ['type' => 'object', 'properties' => ['id' => ['type' => 'string']]]);

        $this->assertErrorContains($this->errors(), 'Registered twice with different definitions');
    }

    // ============================================================
    // STANDALONE SPECS
    // ============================================================

    public function test_a_standalone_spec_registers_no_route(): void
    {
        kizlo_register_spec_route($this->operation([
            'id'        => 'woocommerce.orders',
            'namespace' => 'wc/v3',
            'route'     => '/orders',
        ]));

        do_action('rest_api_init');

        $this->assertArrayNotHasKey('/wc/v3/orders', rest_get_server()->get_routes());
        $this->assertArrayHasKey('woocommerce.orders', $this->document()['apis']);
    }

    public function test_a_standalone_spec_requires_a_namespace(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_spec_route');

        $declaration = $this->operation();
        unset($declaration['namespace']);

        kizlo_register_spec_route($declaration);

        $this->assertErrorContains($this->errors(), '"namespace" is required');
    }

    public function test_a_standalone_spec_rejects_a_runtime_callback(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_spec_route');

        kizlo_register_spec_route($this->operation(['callback' => static fn() => null]));

        $this->assertErrorContains($this->errors(), '"callback" describes a runtime route');
    }

    public function test_a_standalone_spec_rejects_sanitize_and_validate_callbacks(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_spec_route');

        kizlo_register_spec_route($this->operation([
            'input' => [
                'type'       => 'object',
                'properties' => ['page' => ['type' => 'integer', 'sanitize_callback' => 'absint']],
            ],
        ]));

        $this->assertErrorContains($this->errors(), '"sanitize_callback" describes a runtime route');
    }
}
