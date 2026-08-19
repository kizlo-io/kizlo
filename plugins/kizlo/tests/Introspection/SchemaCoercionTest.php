<?php

namespace Kizlo\Tests\Introspection;

use WP_REST_Request;
use WP_REST_Server;

/**
 * Declarations whose intent is unambiguous are repaired rather than rejected.
 *
 * The alternative would stop type generation for every route on the install
 * because one description quoted a number wrongly, so anything that can only have
 * meant one thing is corrected. Anything that could have meant two things is not
 * guessed at.
 */
class SchemaCoercionTest extends IntrospectionTestCase
{
    /**
     * @param array<string, mixed> $property
     * @return array<string, mixed>
     */
    private function property(array $property): array
    {
        $this->registerRouteSchema('acme.widget', ['type' => 'object', 'properties' => ['field' => $property]]);

        return $this->document()['schemas']['acme.widget']['properties']['field'];
    }

    // ============================================================
    // REPAIRED
    // ============================================================

    public function test_a_numeric_title_becomes_a_string(): void
    {
        $this->assertSame('23', $this->property(['type' => 'string', 'title' => 23])['title']);
    }

    public function test_a_numeric_description_becomes_a_string(): void
    {
        $this->assertSame('1.5', $this->property(['type' => 'string', 'description' => 1.5])['description']);
    }

    public function test_a_numeric_string_bound_becomes_a_number(): void
    {
        $field = $this->property(['type' => 'integer', 'minimum' => '5', 'maximum' => '10.5']);

        $this->assertSame(5, $field['minimum']);
        $this->assertSame(10.5, $field['maximum']);
    }

    public function test_a_numeric_string_length_becomes_an_integer(): void
    {
        $this->assertSame(60, $this->property(['type' => 'string', 'maxLength' => '60'])['maxLength']);
    }

    public function test_one_and_zero_become_booleans(): void
    {
        $field = $this->property(['type' => 'string', 'required' => 1, 'nullable' => 0]);

        $this->assertTrue($field['required']);
        $this->assertFalse($field['nullable']);
    }

    public function test_repairs_apply_at_any_depth(): void
    {
        $field = $this->property([
            'type'  => 'array',
            'items' => [
                'type'       => 'object',
                'properties' => ['label' => ['type' => 'string', 'title' => 7]],
            ],
        ]);

        $this->assertSame('7', $field['items']['properties']['label']['title']);
    }

    public function test_two_registrations_differing_only_by_a_repairable_typo_still_merge(): void
    {
        $this->registerRouteSchema('acme.widget', ['type' => 'object', 'title' => 23, 'properties' => []]);
        $this->registerRouteSchema('acme.widget', ['type' => 'object', 'title' => '23', 'properties' => []]);

        $this->assertSame('23', $this->document()['schemas']['acme.widget']['title']);
    }

    public function test_a_repaired_required_flag_is_enforced_at_runtime(): void
    {
        $this->actingAsAdmin();

        kizlo_register_route([
            'id'        => 'acme.widgets',
            'operation' => 'create',
            'route'     => '/widgets',
            'method'    => 'POST',
            'callback'  => static fn() => ['ok' => true],
            'input'     => [
                'type'       => 'object',
                'properties' => ['customer_id' => ['type' => 'integer', 'required' => 1]],
            ],
            'responses' => ['201' => ['body' => ['type' => 'object', 'properties' => []]]],
        ]);

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        do_action('rest_api_init', $wp_rest_server);

        $this->assertTrue($wp_rest_server->get_routes()['/kizlo/v1/widgets'][0]['args']['customer_id']['required']);

        $response = $wp_rest_server->dispatch(new WP_REST_Request('POST', '/kizlo/v1/widgets'));
        $this->assertSame(400, $response->get_status(), 'A repaired flag must actually be enforced.');
    }

    // ============================================================
    // NOT GUESSED AT
    // ============================================================

    public function test_the_spellings_of_true_and_false_are_read_literally(): void
    {
        $field = $this->property([
            'type'             => 'integer',
            'required'         => 'yes',
            'nullable'         => 'no',
            'deprecated'       => 'TRUE',
            'exclusiveMinimum' => 'false',
            'minimum'          => 1,
        ]);

        $this->assertTrue($field['required']);
        $this->assertFalse($field['nullable'], '(bool) "no" is true in PHP; the map is matched literally instead.');
        $this->assertTrue($field['deprecated']);
        $this->assertFalse($field['exclusiveMinimum']);
    }

    public function test_a_word_outside_the_map_is_not_guessed_at(): void
    {
        $this->registerRouteSchema('acme.widget', [
            'type'       => 'object',
            'properties' => ['field' => ['type' => 'string', 'required' => 'maybe']],
        ]);

        $this->assertErrorContains($this->errors(), '"required" must be a boolean');
    }

    public function test_a_referenced_schemas_flag_is_repaired_before_it_reaches_wordpress(): void
    {
        $this->actingAsAdmin();

        $this->registerRouteSchema('acme.address', [
            'type'       => 'object',
            'properties' => ['city' => ['type' => 'string', 'required' => 'yes']],
        ]);

        kizlo_register_route([
            'id'        => 'acme.widgets',
            'operation' => 'create',
            'route'     => '/widgets',
            'method'    => 'POST',
            'callback'  => static fn() => ['ok' => true],
            'input'     => [
                'type'       => 'object',
                'properties' => ['address' => ['$ref' => 'acme.address', 'required' => true]],
            ],
            'responses' => ['201' => ['body' => ['type' => 'object', 'properties' => []]]],
        ]);

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        do_action('rest_api_init', $wp_rest_server);

        $args = $wp_rest_server->get_routes()['/kizlo/v1/widgets'][0]['args'];

        // A referenced schema is inlined into the arguments, so an unrepaired flag
        // there would fail `true === $property['required']` and quietly stop being
        // enforced.
        $this->assertTrue($args['address']['properties']['city']['required']);

        $request = new WP_REST_Request('POST', '/kizlo/v1/widgets');
        $request->set_param('address', ['postcode' => 'SW1']);

        $this->assertSame(400, $wp_rest_server->dispatch($request)->get_status());
    }

    public function test_an_unrepairable_flag_in_a_referenced_schema_stops_registration(): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_route');

        $this->registerRouteSchema('acme.address', [
            'type'       => 'object',
            'properties' => ['city' => ['type' => 'string', 'required' => 'maybe']],
        ]);

        kizlo_register_route([
            'id'        => 'acme.widgets',
            'operation' => 'create',
            'route'     => '/widgets',
            'method'    => 'POST',
            'callback'  => static fn() => ['ok' => true],
            'input'     => [
                'type'       => 'object',
                'properties' => ['address' => ['$ref' => 'acme.address']],
            ],
            'responses' => ['201' => ['body' => ['type' => 'object', 'properties' => []]]],
        ]);

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        do_action('rest_api_init', $wp_rest_server);

        $this->assertArrayNotHasKey('/kizlo/v1/widgets', $wp_rest_server->get_routes());
    }

    public function test_a_non_numeric_bound_is_not_guessed_at(): void
    {
        $this->registerRouteSchema('acme.widget', [
            'type'       => 'object',
            'properties' => ['field' => ['type' => 'integer', 'minimum' => 'five']],
        ]);

        $this->assertErrorContains($this->warnings(), '"minimum" must be a number');
    }

    public function test_a_fractional_length_is_not_rounded(): void
    {
        $this->registerRouteSchema('acme.widget', [
            'type'       => 'object',
            'properties' => ['field' => ['type' => 'string', 'maxLength' => '5.5']],
        ]);

        $this->assertErrorContains($this->warnings(), '"maxLength" must be a non-negative integer');
    }

    public function test_an_unknown_type_is_never_guessed_at(): void
    {
        $this->registerRouteSchema('acme.widget', ['type' => 'object', 'properties' => ['field' => ['type' => 'strong']]]);

        $this->assertErrorContains($this->errors(), 'Unknown type "strong"');
    }

    public function test_enum_and_default_values_are_left_alone(): void
    {
        $field = $this->property(['type' => 'string', 'enum' => ['1', '2'], 'default' => '1']);

        $this->assertSame(['1', '2'], $field['enum'], 'Enum members are data the contract describes, not metadata about it.');
        $this->assertSame('1', $field['default']);
    }
}
