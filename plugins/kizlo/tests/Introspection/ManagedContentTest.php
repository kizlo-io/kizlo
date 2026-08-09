<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\Registration\PostTypeRegistration;
use Kizlo\Modules\Registration\Registrar;
use Kizlo\Modules\Registration\TaxonomyRegistration;

/**
 * Contracts generated for Kizlo-managed post types and taxonomies.
 *
 * The runtime routes stay generic, so what is asserted here is that each managed
 * slug is described at the URL it is really callable on, and that the schemas
 * follow the type's actual configuration rather than a fixed template.
 */
class ManagedContentTest extends IntrospectionTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
    }

    // ============================================================
    // WHICH CONTENT APPEARS
    // ============================================================

    public function test_intentionally_supported_built_ins_are_described(): void
    {
        $apis = $this->document()['apis'];

        $this->assertArrayHasKey('post-types.post', $apis);
        $this->assertArrayHasKey('post-types.page', $apis);
        $this->assertArrayHasKey('taxonomies.category', $apis);
        $this->assertArrayHasKey('taxonomies.post_tag', $apis);
    }

    public function test_attachments_are_described_for_reading_but_not_for_writing(): void
    {
        // A Kizlo-included built-in like post and page, so it belongs in the
        // contract. But PostTypeApi routes every type through
        // WP_REST_Posts_Controller, which never looks at $_FILES, so a create
        // here would produce a row with no file. Reads and deletes work.
        $document = $this->document();

        $paths = $document['apis']['post-types.attachment']['paths'];

        $this->assertSame(['list'], array_keys($paths['/post-types/attachment']));
        $this->assertSame(['delete', 'retrieve'], array_keys($paths['/post-types/attachment/{identifier}']));

        $this->assertArrayHasKey('post-types.attachment.item', $document['schemas']);
        $this->assertArrayNotHasKey('post-types.attachment.create-input', $document['schemas']);
        $this->assertArrayNotHasKey('post-types.attachment.update-input', $document['schemas']);
    }

    public function test_an_ordinary_post_type_keeps_its_write_operations(): void
    {
        $paths = $this->document()['apis']['post-types.post']['paths'];

        $this->assertContains('create', array_keys($paths['/post-types/post']));
        $this->assertContains('update', array_keys($paths['/post-types/post/{identifier}']));
    }

    public function test_unrelated_internal_post_types_are_not_described(): void
    {
        $apis = $this->document()['apis'];

        foreach (['post-types.revision', 'post-types.nav_menu_item', 'post-types.wp_block'] as $id) {
            $this->assertArrayNotHasKey($id, $apis);
        }
    }

    public function test_an_explicitly_included_post_type_is_described(): void
    {
        register_post_type('book', ['public' => true, 'show_in_rest' => true, 'supports' => ['title', 'editor']]);
        kizlo_include_post_type('book');
        $this->seedSettings(['post_types' => ['book' => ['rest_api_enabled' => true]]]);

        $apis = $this->document()['apis'];

        $this->assertArrayHasKey('post-types.book', $apis);
        $this->assertSame(
            ['/post-types/book', '/post-types/book/{identifier}'],
            array_keys($apis['post-types.book']['paths']),
        );
    }

    public function test_a_kizlo_created_post_type_is_described(): void
    {
        $definition = new PostTypeRegistration();
        $definition->setData(['key' => 'movie', 'singular_label' => 'Movie', 'plural_label' => 'Movies', 'active' => true]);
        $definition->save('movie');

        $registrar = new Registrar();
        $registrar->register();
        $registrar->registerObjects();

        $this->seedSettings(['post_types' => ['movie' => ['rest_api_enabled' => true]]]);

        $this->assertArrayHasKey('post-types.movie', $this->document()['apis']);

        unregister_post_type('movie');
    }

    public function test_a_kizlo_created_taxonomy_is_described(): void
    {
        $definition = new TaxonomyRegistration();
        $definition->setData([
            'key'             => 'genre',
            'singular_label'  => 'Genre',
            'plural_label'    => 'Genres',
            'active'          => true,
            'post_types'      => ['post'],
        ]);
        $definition->save('genre');

        $registrar = new Registrar();
        $registrar->register();
        $registrar->registerObjects();

        $this->seedSettings(['taxonomies' => ['genre' => ['rest_api_enabled' => true]]]);

        $this->assertArrayHasKey('taxonomies.genre', $this->document()['apis']);

        unregister_taxonomy('genre');
    }

    public function test_a_post_type_that_was_never_included_is_not_described(): void
    {
        register_post_type('secret', ['public' => false, 'show_in_rest' => true]);

        $this->assertArrayNotHasKey('post-types.secret', $this->document()['apis']);
    }

    public function test_an_api_disabled_post_type_is_not_described(): void
    {
        $this->seedSettings(['post_types' => ['page' => ['rest_api_enabled' => false]]]);

        $apis = $this->document()['apis'];

        $this->assertArrayNotHasKey('post-types.page', $apis);
        $this->assertArrayHasKey('post-types.post', $apis, 'Disabling one type must not affect another.');
    }

    public function test_an_inactive_kizlo_definition_is_not_described(): void
    {
        // getAvailableObjects() returns a synthetic object for a Kizlo-owned type
        // that is switched off, so the admin can still edit it. It has no runtime
        // endpoint, so it has no contract either.
        $this->seedSettings(['post_types' => ['ghost' => ['rest_api_enabled' => true]]]);

        $this->assertArrayNotHasKey('post-types.ghost', $this->document()['apis']);
    }

    public function test_an_api_disabled_taxonomy_is_not_described(): void
    {
        $this->seedSettings(['taxonomies' => ['post_tag' => ['rest_api_enabled' => false]]]);

        $this->assertArrayNotHasKey('taxonomies.post_tag', $this->document()['apis']);
    }

    // ============================================================
    // OPERATIONS
    // ============================================================

    public function test_every_managed_post_type_gets_the_five_crud_operations(): void
    {
        $paths = $this->document()['apis']['post-types.post']['paths'];

        $this->assertSame(['create', 'list'], array_keys($paths['/post-types/post']));
        $this->assertSame(['delete', 'retrieve', 'update'], array_keys($paths['/post-types/post/{identifier}']));
    }

    public function test_the_identifier_stays_a_string_because_the_route_takes_an_id_or_a_slug(): void
    {
        $retrieve = $this->document()['apis']['post-types.post']['paths']['/post-types/post/{identifier}']['retrieve'];

        $this->assertSame('string', $retrieve['input']['properties']['identifier']['type']);
        $this->assertTrue($retrieve['input']['properties']['identifier']['required']);
    }

    public function test_a_list_response_declares_the_pagination_headers(): void
    {
        $list = $this->document()['apis']['post-types.post']['paths']['/post-types/post']['list'];

        $this->assertSame(
            ['X-WP-Total', 'X-WP-TotalPages'],
            array_keys($list['responses'][200]['headers']['properties']),
        );
        $this->assertSame(['$ref' => 'post-types.post.list-item'], $list['responses'][200]['body']['items']);
    }

    public function test_a_taxonomy_update_accepts_both_put_and_patch(): void
    {
        $update = $this->document()['apis']['taxonomies.category']['paths']['/taxonomies/category/{identifier}']['update'];

        $this->assertSame(['PATCH', 'PUT'], $update['methods']);
    }

    // ============================================================
    // LIST VS SINGLE
    // ============================================================

    public function test_only_the_single_item_carries_the_resolved_seo_block(): void
    {
        $schemas = $this->document()['schemas'];

        $item     = $schemas['post-types.post.item']['properties']['kizlo']['properties'];
        $listItem = $schemas['post-types.post.list-item']['properties']['kizlo']['properties'];

        $this->assertSame(['$ref' => 'kizlo.seo', 'required' => true], $item['seo']);
        $this->assertArrayNotHasKey('seo', $listItem);
    }

    public function test_generated_schemas_carry_no_title(): void
    {
        // "title" is a human label, not a type name. Names come from the schema ID,
        // which is unique and validated, so a generator has one naming authority
        // rather than an optional field competing with it.
        $schemas = $this->document()['schemas'];

        foreach (['kizlo.media', 'kizlo.post', 'post-types.post.item', 'post-types.post.create-input', 'taxonomies.category.item'] as $id) {
            $this->assertArrayNotHasKey('title', $schemas[$id], sprintf('%s should not name its own type.', $id));
        }
    }

    public function test_both_list_and_single_extend_the_shared_post_schema(): void
    {
        $schemas = $this->document()['schemas'];

        $this->assertSame('kizlo.post', $schemas['post-types.post.item']['$extends']);
        $this->assertSame('kizlo.post', $schemas['post-types.post.list-item']['$extends']);
    }

    public function test_terms_extend_the_shared_term_schema(): void
    {
        $this->assertSame('kizlo.term', $this->document()['schemas']['taxonomies.category.item']['$extends']);
    }

    // ============================================================
    // SUPPORTS AND HIERARCHY
    // ============================================================

    public function test_post_supports_decide_which_fields_the_schema_carries(): void
    {
        register_post_type('minimal', ['public' => true, 'show_in_rest' => true, 'supports' => ['title']]);
        kizlo_include_post_type('minimal');
        $this->seedSettings(['post_types' => ['minimal' => ['rest_api_enabled' => true]]]);

        $properties = $this->document()['schemas']['post-types.minimal.item']['properties'];

        $this->assertArrayHasKey('title', $properties);
        $this->assertArrayNotHasKey('content', $properties);
        $this->assertArrayNotHasKey('author', $properties);
        $this->assertArrayNotHasKey('featured_media', $properties);
        $this->assertArrayNotHasKey('comment_status', $properties);
    }

    public function test_an_unsupported_author_is_absent_from_the_kizlo_envelope_too(): void
    {
        register_post_type('anon', ['public' => true, 'show_in_rest' => true, 'supports' => ['title']]);
        kizlo_include_post_type('anon');
        $this->seedSettings(['post_types' => ['anon' => ['rest_api_enabled' => true]]]);

        $envelope = $this->document()['schemas']['post-types.anon.item']['properties']['kizlo']['properties'];

        $this->assertArrayNotHasKey('author', $envelope);
        $this->assertArrayNotHasKey('featured_media', $envelope);
        $this->assertArrayHasKey('url', $envelope);
        $this->assertArrayHasKey('extend', $envelope);
    }

    public function test_a_hierarchical_post_type_carries_parent(): void
    {
        $schemas = $this->document()['schemas'];

        $this->assertArrayHasKey('parent', $schemas['post-types.page.item']['properties']);
        $this->assertArrayNotHasKey('parent', $schemas['post-types.post.item']['properties']);
    }

    public function test_a_hierarchical_taxonomy_carries_parent_and_a_parent_filter(): void
    {
        $schemas = $this->document()['schemas'];
        $apis    = $this->document()['apis'];

        $this->assertArrayHasKey('parent', $schemas['taxonomies.category.item']['properties']);
        $this->assertArrayNotHasKey('parent', $schemas['taxonomies.post_tag.item']['properties']);

        $this->assertArrayHasKey(
            'parent',
            $apis['taxonomies.category']['paths']['/taxonomies/category']['list']['input']['properties'],
        );
        $this->assertArrayNotHasKey(
            'parent',
            $apis['taxonomies.post_tag']['paths']['/taxonomies/post_tag']['list']['input']['properties'],
        );
    }

    public function test_a_non_hierarchical_taxonomy_still_reports_parent_in_the_envelope(): void
    {
        // The term envelope mirrors WP_Term::$parent, which is always set.
        $envelope = $this->document()['schemas']['taxonomies.post_tag.item']['properties']['kizlo']['properties'];

        $this->assertSame(['type' => 'integer', 'required' => true], $envelope['parent']);
    }

    public function test_connected_taxonomies_appear_on_the_post_schema_and_in_the_envelope(): void
    {
        $item = $this->document()['schemas']['post-types.post.item'];

        $this->assertSame(['type' => 'integer'], $item['properties']['categories']['items']);
        $this->assertSame(['type' => 'integer'], $item['properties']['tags']['items']);

        $envelope = $item['properties']['kizlo']['properties'];
        $this->assertArrayHasKey('categories', $envelope);
        $this->assertArrayHasKey('tags', $envelope);
    }

    public function test_a_post_type_without_categories_has_no_category_block(): void
    {
        $envelope = $this->document()['schemas']['post-types.page.item']['properties']['kizlo']['properties'];

        $this->assertArrayNotHasKey('categories', $envelope);
        $this->assertArrayNotHasKey('tags', $envelope);
    }

    public function test_only_the_post_type_named_post_carries_sticky(): void
    {
        $schemas = $this->document()['schemas'];

        $this->assertArrayHasKey('sticky', $schemas['post-types.post.item']['properties']);
        $this->assertArrayNotHasKey('sticky', $schemas['post-types.page.item']['properties']);
    }

    // ============================================================
    // INPUTS
    // ============================================================

    public function test_a_create_input_is_extended_by_the_create_operation(): void
    {
        $create = $this->document()['apis']['post-types.post']['paths']['/post-types/post']['create'];

        $this->assertSame('post-types.post.create-input', $create['input']['$extends']);
        $this->assertSame('application/json', $create['input']['content_type']);
    }

    public function test_an_update_operation_adds_only_the_path_parameter_to_its_input(): void
    {
        $update = $this->document()['apis']['post-types.post']['paths']['/post-types/post/{identifier}']['update'];

        $this->assertSame('post-types.post.update-input', $update['input']['$extends']);
        $this->assertSame(['identifier'], array_keys($update['input']['properties']));
    }

    public function test_a_term_name_is_required_on_create_and_optional_on_update(): void
    {
        $schemas = $this->document()['schemas'];

        $this->assertTrue($schemas['taxonomies.category.create-input']['properties']['name']['required']);
        $this->assertArrayNotHasKey('required', $schemas['taxonomies.category.update-input']['properties']['name']);
    }

    public function test_a_writable_text_field_accepts_a_string_or_the_raw_object_form(): void
    {
        $title = $this->document()['schemas']['post-types.post.create-input']['properties']['title'];

        $this->assertSame(['type' => 'string'], $title['anyOf'][0]);
        $this->assertSame('object', $title['anyOf'][1]['type']);
    }

    // ============================================================
    // DELETE
    // ============================================================

    public function test_a_post_delete_response_covers_both_trashing_and_forcing(): void
    {
        $schema = $this->document()['schemas']['post-types.post.delete-response'];

        $this->assertSame(['$ref' => 'post-types.post.item'], $schema['anyOf'][0]);
        $this->assertSame(['deleted', 'previous'], array_keys($schema['anyOf'][1]['properties']));
    }

    public function test_a_term_delete_response_is_always_the_forced_shape(): void
    {
        $schema = $this->document()['schemas']['taxonomies.category.delete-response'];

        $this->assertSame('object', $schema['type']);
        $this->assertSame(['deleted', 'previous'], array_keys($schema['properties']));
    }
}
