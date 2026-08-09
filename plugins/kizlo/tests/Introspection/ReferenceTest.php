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
        kizlo_register_spec_schema('acme.post', [
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
        kizlo_register_spec_schema('acme.list', [
            'type'       => 'object',
            'properties' => ['items' => ['type' => 'array', 'items' => ['$ref' => 'acme.post']]],
        ]);

        $this->registerPost();

        $schemas = $this->document()['schemas'];

        $this->assertSame(['$ref' => 'acme.post'], $schemas['acme.list']['properties']['items']['items']);
    }

    public function test_a_missing_ref_target_fails_introspection(): void
    {
        kizlo_register_spec_schema('acme.list', [
            'type'       => 'object',
            'properties' => ['post' => ['$ref' => 'acme.nope']],
        ]);

        $this->assertErrorContains($this->errors(), 'Unknown schema "acme.nope"');
    }

    public function test_a_ref_may_carry_required_nullable_and_description(): void
    {
        $this->registerPost();

        kizlo_register_spec_schema('acme.list', [
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

        kizlo_register_spec_schema('acme.list', [
            'type'       => 'object',
            'properties' => [
                'post' => ['$ref' => 'acme.post', 'type' => 'object', 'properties' => ['extra' => ['type' => 'string']]],
            ],
        ]);

        $this->assertErrorContains($this->warnings(), 'would redefine the referenced schema');
    }

    public function test_a_recursive_ref_is_allowed(): void
    {
        kizlo_register_spec_schema('acme.node', [
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

        kizlo_register_spec_schema('acme.article', [
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
        kizlo_register_spec_schema('acme.seo', [
            'type'       => 'object',
            'properties' => ['canonical' => ['type' => 'string', 'required' => true]],
        ]);

        kizlo_register_spec_schema('acme.article', [
            '$extends'   => ['acme.post', 'acme.seo'],
            'type'       => 'object',
            'properties' => ['isbn' => ['type' => 'string']],
        ]);

        $this->assertSame(['acme.post', 'acme.seo'], $this->document()['schemas']['acme.article']['$extends']);
    }

    public function test_extends_works_on_a_nested_property(): void
    {
        kizlo_register_spec_schema('acme.user', [
            'type'       => 'object',
            'properties' => ['id' => ['type' => 'integer', 'required' => true]],
        ]);

        kizlo_register_spec_schema('acme.article', [
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
        kizlo_register_spec_schema('acme.user', [
            'type'       => 'object',
            'properties' => ['id' => ['type' => 'integer', 'required' => true]],
        ]);

        kizlo_register_spec_schema('acme.roster', [
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
        kizlo_register_spec_schema('acme.article', [
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
        kizlo_register_spec_schema('acme.shape', ['anyOf' => [['type' => 'string'], ['type' => 'integer']]]);

        kizlo_register_spec_schema('acme.article', [
            '$extends'   => 'acme.shape',
            'type'       => 'object',
            'properties' => [],
        ]);

        $this->assertErrorContains($this->errors(), 'is a union; there is nothing to merge into');
    }

    public function test_extending_a_non_object_fails_introspection(): void
    {
        kizlo_register_spec_schema('acme.name', ['type' => 'string']);

        kizlo_register_spec_schema('acme.article', [
            '$extends'   => 'acme.name',
            'type'       => 'object',
            'properties' => [],
        ]);

        $this->assertErrorContains($this->errors(), 'is not an object schema');
    }

    public function test_circular_inheritance_fails_introspection(): void
    {
        kizlo_register_spec_schema('acme.a', ['$extends' => 'acme.b', 'type' => 'object', 'properties' => []]);
        kizlo_register_spec_schema('acme.b', ['$extends' => 'acme.a', 'type' => 'object', 'properties' => []]);

        $this->assertErrorContains($this->errors(), 'Circular inheritance');
    }

    public function test_an_incompatible_override_fails_introspection(): void
    {
        $this->registerPost();

        kizlo_register_spec_schema('acme.article', [
            '$extends'   => 'acme.post',
            'type'       => 'object',
            'properties' => ['title' => ['type' => 'integer']],
        ]);

        $this->assertErrorContains($this->errors(), 'Property "title" is type "string" in "acme.post" but type "integer"');
    }

    public function test_two_parents_disagreeing_on_a_property_fails_introspection(): void
    {
        kizlo_register_spec_schema('acme.left', ['type' => 'object', 'properties' => ['ref' => ['type' => 'string']]]);
        kizlo_register_spec_schema('acme.right', ['type' => 'object', 'properties' => ['ref' => ['type' => 'integer']]]);

        kizlo_register_spec_schema('acme.article', [
            '$extends'   => ['acme.left', 'acme.right'],
            'type'       => 'object',
            'properties' => [],
        ]);

        $this->assertErrorContains($this->errors(), 'Property "ref" is type "string" in "acme.left" but type "integer" in "acme.right"');
    }

    public function test_a_compatible_override_is_accepted(): void
    {
        $this->registerPost();

        kizlo_register_spec_schema('acme.article', [
            '$extends'   => 'acme.post',
            'type'       => 'object',
            'properties' => ['title' => ['type' => 'string', 'maxLength' => 60]],
        ]);

        $this->assertSame([], $this->errors(), 'Expected a clean contract.');
    }

    public function test_a_parents_own_parents_are_merged_transitively(): void
    {
        kizlo_register_spec_schema('acme.base', ['type' => 'object', 'properties' => ['id' => ['type' => 'integer']]]);
        kizlo_register_spec_schema('acme.middle', ['$extends' => 'acme.base', 'type' => 'object', 'properties' => ['slug' => ['type' => 'string']]]);
        kizlo_register_spec_schema('acme.leaf', ['$extends' => 'acme.middle', 'type' => 'object', 'properties' => ['id' => ['type' => 'string']]]);

        // The conflict is reported against the parent that was extended, not the
        // grandparent that originally declared the property — that is the schema
        // whose declaration has to change.
        $this->assertErrorContains($this->errors(), 'Property "id" is type "integer" in "acme.middle" but type "string" in the extending schema');
    }
}
