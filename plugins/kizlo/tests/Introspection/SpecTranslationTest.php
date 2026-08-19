<?php

namespace Kizlo\Tests\Introspection;

/**
 * `kizlo_translate_spec_properties()` and `kizlo_translate_spec_schema()`, the
 * bridge an extension plugin describes someone else's API through.
 *
 * Exercised through the public functions rather than the class behind them,
 * because the whole point of the bridge is that a plugin can reach it without
 * naming a Kizlo class.
 */
class SpecTranslationTest extends IntrospectionTestCase
{
    // ============================================================
    // TYPES
    // ============================================================

    public function test_a_type_list_becomes_a_union(): void
    {
        $translated = kizlo_translate_spec_properties([
            'title' => ['type' => ['string', 'object'], 'properties' => ['rendered' => ['type' => 'string']]],
        ]);

        $this->assertArrayNotHasKey('type', $translated['title']);
        $this->assertCount(2, $translated['title']['anyOf']);
    }

    public function test_a_null_member_becomes_nullable(): void
    {
        $translated = kizlo_translate_spec_properties(['sku' => ['type' => ['string', 'null']]]);

        $this->assertSame('string', $translated['sku']['type']);
        $this->assertTrue($translated['sku']['nullable']);
    }

    /**
     * WooCommerce writes `date-time` on twenty-eight fields and `bool` on one.
     * Neither is a JSON Schema type, and both have one obvious reading.
     */
    public function test_woocommerce_type_spellings_are_resolved(): void
    {
        $translated = kizlo_translate_spec_properties([
            'date_created'       => ['type' => 'date-time'],
            'is_paying_customer' => ['type' => 'bool'],
        ]);

        $this->assertSame('string', $translated['date_created']['type']);
        $this->assertSame('date-time', $translated['date_created']['format']);
        $this->assertSame('boolean', $translated['is_paying_customer']['type']);
    }

    /**
     * `mixed` has no obvious reading, so it becomes the union of everything JSON
     * has rather than a guess at which branch was meant.
     */
    public function test_a_mixed_type_becomes_a_union_of_every_type(): void
    {
        $translated = kizlo_translate_spec_properties(['value' => ['type' => 'mixed']]);

        $this->assertArrayNotHasKey('type', $translated['value']);
        $this->assertSame(
            ['string', 'integer', 'number', 'boolean', 'object', 'array'],
            array_column($translated['value']['anyOf'], 'type'),
        );
    }

    // ============================================================
    // SHAPES
    // ============================================================

    /**
     * PHP cannot tell an empty list from an empty map, so a schema that has to
     * serialize as `{}` is cast to an object. WooCommerce does this for an
     * `extensions` block nobody has extended, and reading it as untranslatable
     * failed the cart, the checkout and the product schemas whole.
     */
    public function test_an_object_cast_block_is_read_as_a_mapping(): void
    {
        $translated = kizlo_translate_spec_properties([
            'extensions' => ['type' => 'object', 'properties' => (object) []],
        ]);

        $this->assertSame('object', $translated['extensions']['type']);
        $this->assertSame([], $translated['extensions']['properties']);
    }

    public function test_wordpress_bookkeeping_is_dropped(): void
    {
        $translated = kizlo_translate_spec_properties([
            'id' => [
                'type'        => 'integer',
                'context'     => ['view', 'edit'],
                'readonly'    => true,
                'arg_options' => ['sanitize_callback' => 'absint'],
            ],
        ]);

        $this->assertSame(['type' => 'integer'], $translated['id']);
    }

    /**
     * A spec route has no endpoint to attach a callback to and
     * `$this->registerRouteSpec()` rightly refuses one, so the bridge cannot
     * hand any back.
     */
    public function test_runtime_callbacks_do_not_survive(): void
    {
        $translated = kizlo_translate_spec_properties([
            'quantity' => ['type' => 'integer', 'sanitize_callback' => 'absint', 'validate_callback' => 'rest_validate_request_arg'],
        ]);

        $this->assertSame(['type' => 'integer'], $translated['quantity']);
    }

    // ============================================================
    // CONTEXT AND REQUIREDNESS
    // ============================================================

    public function test_a_context_drops_what_it_does_not_return(): void
    {
        $translated = kizlo_translate_spec_properties(
            [
                'username' => ['type' => 'string', 'context' => ['view', 'edit']],
                'password' => ['type' => 'string', 'context' => ['edit']],
            ],
            context: 'view',
        );

        $this->assertArrayHasKey('username', $translated);
        $this->assertArrayNotHasKey('password', $translated);
    }

    /** WordPress reads a missing `context` as every context, and so does this. */
    public function test_a_property_declaring_no_context_survives_one(): void
    {
        $translated = kizlo_translate_spec_properties(['slug' => ['type' => 'string']], context: 'view');

        $this->assertArrayHasKey('slug', $translated);
    }

    public function test_a_context_reaches_nested_properties(): void
    {
        $translated = kizlo_translate_spec_properties(
            [
                'title' => [
                    'type'       => 'object',
                    'properties' => [
                        'rendered' => ['type' => 'string', 'context' => ['view', 'edit']],
                        'raw'      => ['type' => 'string', 'context' => ['edit']],
                    ],
                ],
            ],
            context: 'view',
        );

        $this->assertArrayHasKey('rendered', $translated['title']['properties']);
        $this->assertArrayNotHasKey('raw', $translated['title']['properties']);
    }

    public function test_required_marks_nested_properties_too(): void
    {
        $translated = kizlo_translate_spec_properties(
            [
                'totals' => [
                    'type'       => 'object',
                    'properties' => ['total_price' => ['type' => 'string']],
                ],
            ],
            required: true,
        );

        $this->assertTrue($translated['totals']['required']);
        $this->assertTrue($translated['totals']['properties']['total_price']['required']);
    }

    public function test_required_is_off_by_default(): void
    {
        $translated = kizlo_translate_spec_properties(['page' => ['type' => 'integer']]);

        $this->assertArrayNotHasKey('required', $translated['page']);
    }

    // ============================================================
    // WHAT CANNOT BE TRANSLATED
    // ============================================================

    public function test_an_untranslatable_property_is_dropped_and_reported(): void
    {
        $translated = kizlo_translate_spec_properties(['weird' => ['type' => 'quaternion']], '/acme/things');

        $this->assertArrayNotHasKey('weird', $translated);
        $this->assertErrorContains($this->errors(), 'The "weird" property cannot be expressed as a schema');
    }

    /** A parent missing one child is a different shape, not a narrower one. */
    public function test_an_untranslatable_child_fails_its_parent(): void
    {
        $translated = kizlo_translate_spec_properties([
            'images' => [
                'type'  => 'array',
                'items' => ['type' => 'object', 'properties' => ['taken' => ['type' => 'quaternion']]],
            ],
        ]);

        $this->assertArrayNotHasKey('images', $translated);
    }

    public function test_a_single_schema_translates_on_its_own(): void
    {
        $translated = kizlo_translate_spec_schema([
            'type'     => 'array',
            'context'  => ['view'],
            'items'    => ['type' => 'date-time'],
        ]);

        $this->assertSame('array', $translated['type']);
        $this->assertSame('string', $translated['items']['type']);
        $this->assertArrayNotHasKey('context', $translated);
    }

    public function test_a_single_schema_that_cannot_be_expressed_is_null(): void
    {
        $this->assertNull(kizlo_translate_spec_schema(['type' => 'quaternion']));
        $this->assertNull(kizlo_translate_spec_schema('not a schema'));
    }

    // ============================================================
    // END TO END
    // ============================================================

    /**
     * The bridge's actual job: a WordPress-style controller schema becoming a
     * route another plugin describes, published without a diagnostic.
     */
    public function test_a_translated_schema_registers_as_a_spec_route(): void
    {
        $controller = new \WP_REST_Comments_Controller();
        $schema     = $controller->get_item_schema();

        $this->registerRouteSchema('acme.comment', [
            'type'       => 'object',
            'properties' => kizlo_translate_spec_properties($schema['properties'], 'acme.comment', context: 'view', required: true),
        ]);

        $this->registerRouteSpec([
            'id'        => 'acme.comments',
            'operation' => 'list',
            'namespace' => 'acme/v1',
            'route'     => '/comments',
            'method'    => 'GET',
            'input'     => [
                'type'       => 'object',
                'properties' => kizlo_translate_spec_properties($controller->get_collection_params(), 'acme/v1 /comments'),
            ],
            'responses' => [
                '200' => ['body' => ['type' => 'array', 'items' => ['$ref' => 'acme.comment']]],
            ],
        ]);

        $document = $this->document();

        $this->assertSame([], $this->errors());
        $this->assertArrayHasKey('acme.comment', $document['schemas']);
        $this->assertArrayHasKey('acme.comments', $document['apis']);

        $properties = $document['schemas']['acme.comment']['properties'];
        $this->assertArrayHasKey('id', $properties);
        $this->assertTrue($properties['id']['required']);
    }
}
