<?php

namespace Kizlo\Tests\Introspection;

/**
 * `$ref` and `$extends`: what they resolve against, what they refuse, and the
 * fact that neither is resolved in the emitted document.
 */
class ReferenceTest extends IntrospectionTestCase
{
    private function registerPost(): void
    {
        $this->registerRouteSchema('acme.post', [
            'type'       => 'object',
            'properties' => [
                'id'    => ['type' => 'integer', 'required' => true],
                'title' => ['type' => 'string', 'required' => true],
            ],
        ]);
    }

    // ============================================================
    // $ref
    // ============================================================

    public function test_a_ref_resolves_regardless_of_registration_order(): void
    {
        $this->registerRouteSchema('acme.list', [
            'type'       => 'object',
            'properties' => ['items' => ['type' => 'array', 'items' => ['$ref' => 'acme.post']]],
        ]);

        $this->registerPost();

        $schemas = $this->document()['schemas'];

        $this->assertSame(['$ref' => 'acme.post'], $schemas['acme.list']['properties']['items']['items']);
    }

    public function test_a_missing_ref_target_fails_introspection(): void
    {
        $this->registerRouteSchema('acme.list', [
            'type'       => 'object',
            'properties' => ['post' => ['$ref' => 'acme.nope']],
        ]);

        $this->assertErrorContains($this->errors(), 'Unknown schema "acme.nope"');
    }

    public function test_a_ref_may_carry_required_nullable_and_description(): void
    {
        $this->registerPost();

        $this->registerRouteSchema('acme.list', [
            'type'       => 'object',
            'properties' => [
                'post' => ['$ref' => 'acme.post', 'required' => true, 'nullable' => true, 'description' => 'The post.'],
            ],
        ]);

        $this->assertSame([], $this->errors(), 'Expected a clean contract.');
    }

    public function test_a_ref_may_not_redefine_the_schema_it_points_at(): void
    {
        $this->registerPost();

        $this->registerRouteSchema('acme.list', [
            'type'       => 'object',
            'properties' => [
                'post' => ['$ref' => 'acme.post', 'type' => 'object', 'properties' => ['extra' => ['type' => 'string']]],
            ],
        ]);

        $this->assertErrorContains($this->warnings(), 'would redefine the referenced schema');
    }

    public function test_a_recursive_ref_is_allowed(): void
    {
        $this->registerRouteSchema('acme.node', [
            'type'       => 'object',
            'properties' => [
                'name'     => ['type' => 'string', 'required' => true],
                'children' => ['type' => 'array', 'items' => ['$ref' => 'acme.node']],
            ],
        ]);

        $this->assertSame([], $this->errors(), 'Expected a clean contract.');
    }

    // ============================================================
    // $extends
    // ============================================================

    public function test_extends_merges_a_parents_properties_and_stays_unresolved(): void
    {
        $this->registerPost();

        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.post',
            'type'       => 'object',
            'properties' => ['isbn' => ['type' => 'string']],
        ]);

        $article = $this->document()['schemas']['acme.article'];

        $this->assertSame('acme.post', $article['$extends']);
        $this->assertSame(['isbn'], array_keys($article['properties']), 'Inherited properties must not be inlined.');
    }

    public function test_extends_accepts_multiple_parents(): void
    {
        $this->registerPost();
        $this->registerRouteSchema('acme.seo', [
            'type'       => 'object',
            'properties' => ['canonical' => ['type' => 'string', 'required' => true]],
        ]);

        $this->registerRouteSchema('acme.article', [
            '$extends'   => ['acme.post', 'acme.seo'],
            'type'       => 'object',
            'properties' => ['isbn' => ['type' => 'string']],
        ]);

        $this->assertSame(['acme.post', 'acme.seo'], $this->document()['schemas']['acme.article']['$extends']);
    }

    public function test_extends_works_on_a_nested_property(): void
    {
        $this->registerRouteSchema('acme.user', [
            'type'       => 'object',
            'properties' => ['id' => ['type' => 'integer', 'required' => true]],
        ]);

        $this->registerRouteSchema('acme.article', [
            'type'       => 'object',
            'properties' => [
                'author' => [
                    'type'       => 'object',
                    '$extends'   => 'acme.user',
                    'properties' => ['badge' => ['type' => 'string']],
                ],
            ],
        ]);

        $this->assertSame(
            'acme.user',
            $this->document()['schemas']['acme.article']['properties']['author']['$extends'],
        );
    }

    public function test_extends_works_on_an_array_items_schema(): void
    {
        $this->registerRouteSchema('acme.user', [
            'type'       => 'object',
            'properties' => ['id' => ['type' => 'integer', 'required' => true]],
        ]);

        $this->registerRouteSchema('acme.roster', [
            'type'  => 'array',
            'items' => [
                'type'       => 'object',
                '$extends'   => 'acme.user',
                'properties' => ['seat' => ['type' => 'integer']],
            ],
        ]);

        $this->assertSame([], $this->errors(), 'Expected a clean contract.');
    }

    public function test_an_unknown_parent_fails_introspection(): void
    {
        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.postt',
            'type'       => 'object',
            'properties' => [],
        ]);

        $errors = $this->errorsFor($this->errors(), 'schema_id', 'acme.article');

        $this->assertErrorContains($errors, 'Unknown parent schema "acme.postt"');
        $this->assertSame('$extends', $errors[0]['data']['keyword']);
    }

    public function test_extending_a_union_fails_introspection(): void
    {
        $this->registerRouteSchema('acme.shape', ['anyOf' => [['type' => 'string'], ['type' => 'integer']]]);

        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.shape',
            'type'       => 'object',
            'properties' => [],
        ]);

        $this->assertErrorContains($this->errors(), 'is a union; there is nothing to merge into');
    }

    public function test_extending_a_non_object_fails_introspection(): void
    {
        $this->registerRouteSchema('acme.name', ['type' => 'string']);

        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.name',
            'type'       => 'object',
            'properties' => [],
        ]);

        $this->assertErrorContains($this->errors(), 'is not an object schema');
    }

    /**
     * "That shape, or nothing" still has a shape to inherit. The child takes the parent's
     * properties and not its nullability, since it did not declare itself nullable.
     */
    public function test_extending_a_nullable_parent_is_accepted(): void
    {
        $this->registerRouteSchema('acme.address', [
            'type'       => 'object',
            'nullable'   => true,
            'properties' => ['city' => ['type' => 'string', 'required' => true]],
        ]);

        $this->registerRouteSchema('acme.billing-address', [
            '$extends'   => 'acme.address',
            'type'       => 'object',
            'properties' => ['vat_number' => ['type' => 'string']],
        ]);

        $this->assertSame([], $this->errors(), 'Expected a clean contract.');
        $this->assertArrayHasKey('acme.billing-address', $this->document()['schemas']);
    }

    public function test_making_an_inherited_property_optional_fails_introspection(): void
    {
        $this->registerPost();

        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.post',
            'type'       => 'object',
            'properties' => ['title' => ['type' => 'string']],
        ]);

        $this->assertErrorContains(
            $this->errors(),
            'Property "title" is required in "acme.post" but optional in the extending schema',
        );
    }

    public function test_making_an_inherited_property_nullable_fails_introspection(): void
    {
        $this->registerPost();

        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.post',
            'type'       => 'object',
            'properties' => ['title' => ['type' => 'string', 'required' => true, 'nullable' => true]],
        ]);

        $this->assertErrorContains(
            $this->errors(),
            'Property "title" is not nullable in "acme.post" but nullable in the extending schema',
        );
    }

    public function test_widening_an_inherited_enum_fails_introspection(): void
    {
        $this->registerRouteSchema('acme.entry', [
            'type'       => 'object',
            'properties' => ['status' => ['type' => 'string', 'required' => true, 'enum' => ['draft', 'publish']]],
        ]);

        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.entry',
            'type'       => 'object',
            'properties' => ['status' => ['type' => 'string', 'required' => true]],
        ]);

        $this->assertErrorContains(
            $this->errors(),
            'Property "status" is limited to "draft", "publish" in "acme.entry" but unrestricted in the extending schema',
        );
    }

    /**
     * An interface member has to stay assignable to the one it overrides, which leaves the
     * extending schema free to move in the other direction.
     */
    public function test_narrowing_an_inherited_property_is_accepted(): void
    {
        $this->registerRouteSchema('acme.entry', [
            'type'       => 'object',
            'properties' => [
                'status' => ['type' => 'string', 'enum' => ['draft', 'publish']],
                'title'  => ['type' => 'string', 'nullable' => true],
            ],
        ]);

        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.entry',
            'type'       => 'object',
            'properties' => [
                'status' => ['type' => 'string', 'required' => true, 'enum' => ['draft']],
                'title'  => ['type' => 'string'],
            ],
        ]);

        $this->assertSame([], $this->errors(), 'Expected a clean contract.');
    }

    /**
     * Narrowing is the extending schema's alone. TypeScript needs a property shared across two
     * bases to be identical in each, so one parent cannot narrow another's.
     */
    public function test_one_parent_narrowing_anothers_property_fails_introspection(): void
    {
        $this->registerRouteSchema('acme.left', ['type' => 'object', 'properties' => ['ref' => ['type' => 'string']]]);
        $this->registerRouteSchema('acme.right', [
            'type'       => 'object',
            'properties' => ['ref' => ['type' => 'string', 'required' => true]],
        ]);

        $this->registerRouteSchema('acme.article', [
            '$extends'   => ['acme.left', 'acme.right'],
            'type'       => 'object',
            'properties' => [],
        ]);

        $this->assertErrorContains(
            $this->errors(),
            'Property "ref" is optional in "acme.left" but required in "acme.right"',
        );
    }

    public function test_circular_inheritance_fails_introspection(): void
    {
        $this->registerRouteSchema('acme.a', ['$extends' => 'acme.b', 'type' => 'object', 'properties' => []]);
        $this->registerRouteSchema('acme.b', ['$extends' => 'acme.a', 'type' => 'object', 'properties' => []]);

        $this->assertErrorContains($this->errors(), 'Circular inheritance');
    }

    public function test_an_incompatible_override_fails_introspection(): void
    {
        $this->registerPost();

        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.post',
            'type'       => 'object',
            'properties' => ['title' => ['type' => 'integer']],
        ]);

        $this->assertErrorContains($this->errors(), 'Property "title" is type "string" in "acme.post" but type "integer"');
    }

    public function test_two_parents_disagreeing_on_a_property_fails_introspection(): void
    {
        $this->registerRouteSchema('acme.left', ['type' => 'object', 'properties' => ['ref' => ['type' => 'string']]]);
        $this->registerRouteSchema('acme.right', ['type' => 'object', 'properties' => ['ref' => ['type' => 'integer']]]);

        $this->registerRouteSchema('acme.article', [
            '$extends'   => ['acme.left', 'acme.right'],
            'type'       => 'object',
            'properties' => [],
        ]);

        $this->assertErrorContains($this->errors(), 'Property "ref" is type "string" in "acme.left" but type "integer" in "acme.right"');
    }

    public function test_a_compatible_override_is_accepted(): void
    {
        $this->registerPost();

        $this->registerRouteSchema('acme.article', [
            '$extends'   => 'acme.post',
            'type'       => 'object',
            // Restating the property means restating `required` with it. Absent, the override
            // reads as optional, which is the one thing an interface member may not become.
            'properties' => ['title' => ['type' => 'string', 'required' => true, 'maxLength' => 60]],
        ]);

        $this->assertSame([], $this->errors(), 'Expected a clean contract.');
    }

    public function test_a_parents_own_parents_are_merged_transitively(): void
    {
        $this->registerRouteSchema('acme.base', ['type' => 'object', 'properties' => ['id' => ['type' => 'integer']]]);
        $this->registerRouteSchema('acme.middle', ['$extends' => 'acme.base', 'type' => 'object', 'properties' => ['slug' => ['type' => 'string']]]);
        $this->registerRouteSchema('acme.leaf', ['$extends' => 'acme.middle', 'type' => 'object', 'properties' => ['id' => ['type' => 'string']]]);

        // The conflict is reported against the parent that was extended, not the
        // grandparent that originally declared the property — that is the schema
        // whose declaration has to change.
        $this->assertErrorContains($this->errors(), 'Property "id" is type "integer" in "acme.middle" but type "string" in the extending schema');
    }
}
