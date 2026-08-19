<?php

namespace Kizlo\Tests\Introspection;

use WP_REST_Request;
use WP_REST_Server;
use Kizlo\Modules\Introspection\ArgTranslator;
use Kizlo\Modules\Introspection\OperationErrors;

/**
 * `kizlo_register_route()` doing both of its jobs at once: registering a working
 * WordPress endpoint whose validation comes from the declared input, and
 * contributing the same normalized operation a standalone spec would.
 */
class RuntimeRouteTest extends IntrospectionTestCase
{
    private WP_REST_Server $server;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAsAdmin();
    }

    /** Register everything queued on rest_api_init and take the resulting server. */
    private function boot(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        do_action('rest_api_init', $this->server);
    }

    /**
     * @param array<string, mixed> $params
     */
    private function dispatch(string $method, string $route, array $params = []): \WP_REST_Response
    {
        $request = new WP_REST_Request($method, $route);

        foreach ($params as $key => $value) {
            $request->set_param($key, $value);
        }

        return $this->server->dispatch($request);
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function registerWidgets(array $overrides = []): void
    {
        kizlo_register_route(array_merge([
            'id'        => 'acme.widgets',
            'operation' => 'create',
            'route'     => '/widgets',
            'method'    => 'POST',
            'callback'  => static fn(WP_REST_Request $request) => ['received' => $request->get_param('customer_id')],
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'customer_id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint'],
                    'note'        => ['type' => 'string', 'maxLength' => 10],
                ],
            ],
            'responses' => [
                '201' => ['description' => 'Created.', 'body' => ['type' => 'object', 'properties' => ['received' => ['type' => 'integer']]]],
                '400' => ['description' => 'Invalid.', 'body' => ['$ref' => 'kizlo.error']],
            ],
        ], $overrides));
    }

    // ============================================================
    // REGISTRATION
    // ============================================================

    public function test_a_flat_declaration_registers_a_working_route(): void
    {
        $this->registerWidgets();
        $this->boot();

        $this->assertArrayHasKey('/kizlo/v1/widgets', $this->server->get_routes());

        $response = $this->dispatch('POST', '/kizlo/v1/widgets', ['customer_id' => 42]);

        $this->assertSame(200, $response->get_status());
        $this->assertSame(42, $response->get_data()['received']);
    }

    public function test_a_route_without_an_id_registers_and_contributes_nothing(): void
    {
        kizlo_register_route([
            'route'    => '/legacy',
            'method'   => 'GET',
            'callback' => static fn() => ['ok' => true],
        ]);

        $this->boot();

        $this->assertArrayHasKey('/kizlo/v1/legacy', $this->server->get_routes());
        $this->assertArrayNotHasKey('acme.widgets', $this->document()['apis']);
    }

    public function test_a_runtime_route_rejects_an_array_method(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        kizlo_register_route([
            'route'    => '/array-method',
            'method'   => ['GET'],
            'callback' => static fn() => ['ok' => true],
        ]);

        $this->boot();

        $this->assertArrayNotHasKey('/kizlo/v1/array-method', $this->server->get_routes());
        $this->assertErrorContains($this->errors(), 'arrays are not supported');
    }

    public function test_a_supplied_permission_callback_is_reported_and_the_route_stays_admin_only(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        kizlo_register_route([
            'route'               => '/open',
            'method'              => 'GET',
            'callback'            => static fn() => ['ok' => true],
            'permission_callback' => '__return_true',
        ]);

        $this->boot();

        $this->assertArrayHasKey('/kizlo/v1/open', $this->server->get_routes());
        $this->assertErrorContains($this->errors(), '"permission_callback" is not supported');

        wp_set_current_user(0);

        $this->assertSame(
            403,
            $this->dispatch('GET', '/kizlo/v1/open')->get_status(),
            'The supplied permission callback must not have replaced the admin-only check.',
        );
    }

    public function test_a_route_without_a_callback_is_reported_and_registers_nothing(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        kizlo_register_route([
            'id'        => 'acme.widgets',
            'operation' => 'create',
            'route'     => '/widgets',
            'method'    => 'POST',
        ]);

        $this->boot();

        $this->assertArrayNotHasKey('/kizlo/v1/widgets', $this->server->get_routes());
        $this->assertArrayNotHasKey('acme.widgets', $this->document()['apis']);
        $this->assertErrorContains($this->errors(), '"callback" is required');
    }

    public function test_a_runtime_route_contributes_the_same_shape_as_a_standalone_spec(): void
    {
        $this->registerWidgets();

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['create'];

        $this->assertSame('POST', $operation['method']);
        $this->assertSame('Created.', $operation['responses'][201]['description']);
        $this->assertSame('application/json', $operation['input']['content_type']);
    }

    public function test_a_runtime_route_adds_shared_errors_and_responses(): void
    {
        $this->registerWidgets(['errors' => ['widget_rejected']]);

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['create'];
        $expected  = array_merge(OperationErrors::SHARED, ['widget_rejected']);
        sort($expected, SORT_STRING);

        $this->assertSame($expected, $operation['errors']);
        $this->assertSame(['201', '400', '401', '403'], array_map('strval', array_keys($operation['responses'])));
        $this->assertSame('kizlo.error', $operation['responses'][401]['body']['$ref']);
        $this->assertSame('kizlo.error', $operation['responses'][403]['body']['$ref']);
    }

    public function test_declaring_a_shared_error_again_is_a_duplicate(): void
    {
        $this->registerWidgets(['errors' => ['invalid_param']]);

        $this->assertErrorContains($this->errors(), 'declared more than once');
    }

    // ============================================================
    // INPUT DRIVES WORDPRESS VALIDATION
    // ============================================================

    public function test_the_input_drives_required_parameter_validation(): void
    {
        $this->registerWidgets();
        $this->boot();

        $response = $this->dispatch('POST', '/kizlo/v1/widgets');

        $this->assertSame(400, $response->get_status());
        $this->assertSame('rest_missing_callback_param', $response->get_data()['code']);
    }

    public function test_the_input_drives_type_and_constraint_validation(): void
    {
        $this->registerWidgets();
        $this->boot();

        $response = $this->dispatch('POST', '/kizlo/v1/widgets', ['customer_id' => 1, 'note' => 'far too long to fit']);

        $this->assertSame(400, $response->get_status());
        $this->assertSame('rest_invalid_param', $response->get_data()['code']);
    }

    public function test_a_declared_sanitize_callback_runs(): void
    {
        $this->registerWidgets();
        $this->boot();

        $response = $this->dispatch('POST', '/kizlo/v1/widgets', ['customer_id' => '-7']);

        $this->assertSame(7, $response->get_data()['received'], 'absint should have run on the value.');
    }

    public function test_callbacks_never_appear_in_introspection(): void
    {
        $this->registerWidgets();

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['create'];
        $encoded   = (string) wp_json_encode($operation);

        $this->assertStringNotContainsString('"sanitize_callback":', $encoded);
        $this->assertStringNotContainsString('"callback":', $encoded);
    }

    public function test_an_introspected_route_rejects_a_duplicate_args_array(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        $this->registerWidgets(['args' => ['customer_id' => ['type' => 'integer']]]);

        $this->assertErrorContains($this->errors(), 'the "args" array is redundant');
    }

    public function test_a_nested_runtime_callback_is_reported_as_ignored(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => [
                    'customer_id' => ['type' => 'integer', 'required' => true],
                    'address'     => [
                        'type'       => 'object',
                        'properties' => ['city' => ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']],
                    ],
                ],
            ],
        ]);

        $this->assertErrorContains($this->errors(), 'WordPress ignores it here');
    }

    // ============================================================
    // ARGUMENT TRANSLATION
    // ============================================================

    public function test_refs_and_extends_are_resolved_for_the_runtime_but_not_the_document(): void
    {
        kizlo_register_spec_schema('acme.address', [
            'type'       => 'object',
            'properties' => ['city' => ['type' => 'string', 'required' => true]],
        ]);

        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => [
                    'customer_id' => ['type' => 'integer', 'required' => true],
                    'address'     => ['$ref' => 'acme.address'],
                ],
            ],
        ]);

        $this->boot();

        $args = $this->server->get_routes()['/kizlo/v1/widgets'][0]['args'];

        $this->assertSame('object', $args['address']['type']);
        $this->assertSame(['city'], array_keys($args['address']['properties']));

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['create'];
        $this->assertSame(['$ref' => 'acme.address'], $operation['input']['properties']['address']);
    }

    /**
     * The likeliest place for the translation to be subtly wrong, so it is checked
     * against the real validator rather than assumed.
     * `rest_validate_object_value_from_schema()` reads a boolean `required` on each
     * property only when the object itself carries no `required` array, which is
     * exactly how the contract spells it — so no translation is needed, and this
     * proves it.
     */
    public function test_a_nested_required_property_is_enforced_by_rest_validate_value_from_schema(): void
    {
        kizlo_register_spec_schema('acme.address', [
            'type'       => 'object',
            'properties' => [
                'city'     => ['type' => 'string', 'required' => true],
                'postcode' => ['type' => 'string'],
            ],
        ]);

        $args = ArgTranslator::toArgs(
            ['type' => 'object', 'properties' => ['address' => ['$ref' => 'acme.address']]],
            ['acme.address' => [
                'type'       => 'object',
                'properties' => [
                    'city'     => ['type' => 'string', 'required' => true],
                    'postcode' => ['type' => 'string'],
                ],
            ]],
        );

        $this->assertArrayNotHasKey('required', $args['address'], 'The object itself carries no required array.');

        $missing = rest_validate_value_from_schema(['postcode' => 'SW1'], $args['address'], 'address');
        $this->assertWPError($missing);

        $present = rest_validate_value_from_schema(['city' => 'London'], $args['address'], 'address');
        $this->assertTrue($present);
    }

    public function test_a_nested_required_property_is_enforced_through_a_real_request(): void
    {
        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => [
                    'address' => [
                        'type'       => 'object',
                        'required'   => true,
                        'properties' => [
                            'city' => ['type' => 'string', 'required' => true],
                            'zip'  => ['type' => 'string'],
                        ],
                    ],
                ],
            ],
        ]);
        $this->boot();

        $rejected = $this->dispatch('POST', '/kizlo/v1/widgets', ['address' => ['zip' => 'SW1']]);
        $this->assertSame(400, $rejected->get_status());

        $accepted = $this->dispatch('POST', '/kizlo/v1/widgets', ['address' => ['city' => 'London']]);
        $this->assertSame(200, $accepted->get_status());
    }

    public function test_nullable_becomes_a_null_union_for_wordpress(): void
    {
        $args = ArgTranslator::toArgs(
            ['type' => 'object', 'properties' => ['date' => ['type' => 'string', 'nullable' => true]]],
            [],
        );

        $this->assertSame(['string', 'null'], $args['date']['type']);
        $this->assertTrue(rest_validate_value_from_schema(null, $args['date'], 'date'));
    }

    public function test_file_properties_are_not_translated_into_wordpress_arguments(): void
    {
        $args = ArgTranslator::toArgs(
            [
                'type'         => 'object',
                'content_type' => 'multipart/form-data',
                'properties'   => [
                    'upload' => ['type' => 'file', 'required' => true],
                    'title'  => ['type' => 'string'],
                ],
            ],
            [],
        );

        $this->assertSame(['title'], array_keys($args), 'Uploads arrive in $_FILES, which the schema validator never sees.');
    }

    public function test_documentation_only_keywords_are_dropped_from_the_runtime_arguments(): void
    {
        $args = ArgTranslator::toArgs(
            ['type' => 'object', 'properties' => ['name' => ['type' => 'string', 'title' => 'Name', 'deprecated' => true]]],
            [],
        );

        $this->assertSame(['type', 'validate_callback', 'sanitize_callback'], array_keys($args['name']));
    }

    public function test_a_non_boolean_required_stops_the_endpoint_from_registering(): void
    {
        // rest_validate_object_value_from_schema() compares with `true ===`, so a
        // nested truthy-but-not-true required silently stops being enforced while
        // still reading as required. SchemaCoercer repairs the spellings that can
        // only have meant one thing; this is not one of them.
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => [
                    'address' => [
                        'type'       => 'object',
                        'properties' => ['city' => ['type' => 'string', 'required' => 'maybe']],
                    ],
                ],
            ],
        ]);

        $this->boot();

        $this->assertArrayNotHasKey('/kizlo/v1/widgets', $this->server->get_routes());
        $this->assertErrorContains($this->errors(), 'must be a boolean, or WordPress will not enforce it');
    }

    public function test_an_untyped_property_stops_the_endpoint_from_registering(): void
    {
        // WordPress warns on an unknown type and then returns valid, so every
        // constraint declared alongside it would stop being enforced.
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => ['customer_id' => ['type' => 'bigint', 'minimum' => 1]],
            ],
        ]);

        $this->boot();

        $this->assertArrayNotHasKey('/kizlo/v1/widgets', $this->server->get_routes());
        $this->assertErrorContains($this->errors(), 'declares no usable type');
    }

    public function test_a_union_argument_is_validated(): void
    {
        // A union carries no `type`, and WordPress only auto-validates an argument
        // that has one — so without an explicit validate_callback this reached the
        // handler unchecked.
        kizlo_register_spec_schema('acme.card', [
            'type'       => 'object',
            'properties' => ['method' => ['type' => 'string', 'required' => true, 'enum' => ['card']]],
        ]);
        kizlo_register_spec_schema('acme.bank', [
            'type'       => 'object',
            'properties' => ['method' => ['type' => 'string', 'required' => true, 'enum' => ['bank']]],
        ]);
        kizlo_register_spec_schema('acme.payment', [
            'oneOf' => [['$ref' => 'acme.card'], ['$ref' => 'acme.bank']],
        ]);

        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => ['payment' => ['$ref' => 'acme.payment']],
            ],
        ]);
        $this->boot();

        $this->assertSame(400, $this->dispatch('POST', '/kizlo/v1/widgets', ['payment' => ['method' => 'crypto']])->get_status());
        $this->assertSame(200, $this->dispatch('POST', '/kizlo/v1/widgets', ['payment' => ['method' => 'card']])->get_status());
    }

    public function test_a_declared_sanitize_callback_does_not_switch_off_validation(): void
    {
        // Declaring a sanitize_callback replaces the default that was doing the
        // validating, so the constraints have to survive on their own.
        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => [
                    'customer_id' => [
                        'type'              => 'integer',
                        'required'          => true,
                        'minimum'           => 10,
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ]);
        $this->boot();

        $this->assertSame(400, $this->dispatch('POST', '/kizlo/v1/widgets', ['customer_id' => 3])->get_status());

        // WordPress validates before it sanitizes, so a declared constraint applies
        // to the value as it arrived, not to whatever the sanitizer would make of it.
        $accepted = $this->dispatch('POST', '/kizlo/v1/widgets', ['customer_id' => '42']);
        $this->assertSame(200, $accepted->get_status());
        $this->assertSame(42, $accepted->get_data()['received'], 'The declared sanitizer still runs.');
    }

    public function test_an_uncompilable_pattern_stops_the_endpoint_from_registering(): void
    {
        // preg_match() warns and returns false on a bad expression, which
        // rest_validate_json_schema_pattern() reads as a match — so the constraint
        // would be declared and never applied.
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => ['note' => ['type' => 'string', 'pattern' => '[unclosed']],
            ],
        ]);

        $this->boot();

        $this->assertArrayNotHasKey('/kizlo/v1/widgets', $this->server->get_routes());
        $this->assertErrorContains($this->errors(), 'not a usable regular expression');
    }

    public function test_a_valid_pattern_is_kept_and_enforced(): void
    {
        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => ['note' => ['type' => 'string', 'pattern' => '^[a-z]+$']],
            ],
        ]);

        $this->boot();

        $this->assertSame(400, $this->dispatch('POST', '/kizlo/v1/widgets', ['note' => 'NOPE'])->get_status());
        $this->assertSame(200, $this->dispatch('POST', '/kizlo/v1/widgets', ['note' => 'fine'])->get_status());
    }

    public function test_a_documentation_only_mistake_leaves_the_endpoint_running(): void
    {
        // Unknown to the contract and ignored by WordPress, so it weakens nothing —
        // and unlike a numeric title, there is no obvious repair for it either.
        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => ['customer_id' => ['type' => 'integer', 'required' => true, 'allOf' => []]],
            ],
        ]);

        $this->boot();

        $this->assertArrayHasKey(
            '/kizlo/v1/widgets',
            $this->server->get_routes(),
            'A typo in documentation metadata must not take a working endpoint offline.',
        );
        $this->assertSame(200, $this->dispatch('POST', '/kizlo/v1/widgets', ['customer_id' => 1])->get_status());
        $this->assertErrorContains($this->warnings(), 'Unknown keyword "allOf". Use "$extends"');
    }

    public function test_a_repairable_mistake_neither_fails_introspection_nor_the_endpoint(): void
    {
        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => ['customer_id' => ['type' => 'integer', 'required' => true, 'title' => 42]],
            ],
        ]);

        $this->boot();

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['create'];

        $this->assertSame('42', $operation['input']['properties']['customer_id']['title']);
        $this->assertSame(200, $this->dispatch('POST', '/kizlo/v1/widgets', ['customer_id' => 1])->get_status());
    }

    public function test_an_unresolvable_ref_stops_the_endpoint_from_registering(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        $this->registerWidgets([
            'input' => [
                'type'       => 'object',
                'properties' => ['address' => ['$ref' => 'acme.missing']],
            ],
        ]);

        $this->boot();

        $this->assertArrayNotHasKey(
            '/kizlo/v1/widgets',
            $this->server->get_routes(),
            'An endpoint that cannot build its declared validation must not accept requests.',
        );
        $this->assertErrorContains($this->errors(), 'would have skipped its declared validation');
    }
}
