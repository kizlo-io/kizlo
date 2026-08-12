<?php

namespace Kizlo\Tests\Introspection;

use WP_REST_Request;
use WP_REST_Server;
use WP_REST_Posts_Controller;
use WP_REST_Terms_Controller;
use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\CoreSchemas;

/**
 * The managed item and input contracts being derived rather than written out.
 *
 * {@see DerivedParametersTest} did this for the list. Either side of it the same
 * fork had opened, and nobody could say how wide: `class_list` had been returned
 * since WordPress 6.8 and was described nowhere, `format` was a bare string where
 * core enumerates the registered post formats, and the supports gating disagreed
 * with core outright, because core uses a fixed schema for `post`, `page` and
 * `attachment` and ignores their registered supports.
 *
 * What is asserted here is that the described fields and the controller's fields
 * are now the same fields, on both sides. The first two tests are the ones that
 * matter; the rest name what the old hand-written schemas got wrong, so those
 * cannot come back one at a time.
 */
class DerivedItemSchemaTest extends IntrospectionTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
    }

    /**
     * `$wp_rest_additional_fields` and the registered meta keys are process-global,
     * and `WP_UnitTestCase` only resets them when running core's own suite. Left
     * alone, a field registered here would follow every later test into its
     * document, and one of them builds twice and compares hashes.
     */
    protected function tearDown(): void
    {
        unset(
            $GLOBALS['wp_rest_additional_fields']['post']['acme_channel'],
            $GLOBALS['wp_rest_additional_fields']['post']['acme_broken'],
        );

        unregister_post_meta('post', 'acme_colour');

        parent::tearDown();
    }

    // ============================================================
    // THE DESCRIBED SURFACE IS THE CONTROLLER'S SURFACE
    // ============================================================

    /**
     * @dataProvider postTypeProvider
     */
    public function test_every_field_the_posts_controller_returns_is_described(string $slug): void
    {
        $described = $this->itemProperties(sprintf('post-types.%s.item', $slug));

        // The envelope and the configured custom fields are Kizlo's own, and are
        // the only things in the response that core has no opinion about.
        unset($described['kizlo']);

        $this->assertSame(
            $this->sorted(array_keys((new WP_REST_Posts_Controller($slug))->get_item_schema()['properties'])),
            $this->sorted(array_keys($described)),
        );
    }

    /**
     * @dataProvider postTypeProvider
     */
    public function test_every_field_the_posts_controller_accepts_is_described(string $slug): void
    {
        if (!in_array($slug, ['post', 'page'], true)) {
            $this->markTestSkipped('attachment is read-only through the managed routes.');
        }

        $controller = new WP_REST_Posts_Controller($slug);

        foreach ([WP_REST_Server::CREATABLE => 'create', WP_REST_Server::EDITABLE => 'update'] as $method => $operation) {
            $this->assertSame(
                $this->sorted(array_keys($controller->get_endpoint_args_for_item_schema($method))),
                $this->sorted(array_keys($this->itemProperties(sprintf('post-types.%s.%s-input', $slug, $operation)))),
                $operation,
            );
        }
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function postTypeProvider(): array
    {
        return [
            'post'       => ['post'],
            'page'       => ['page'],
            'attachment' => ['attachment'],
        ];
    }

    public function test_every_field_the_terms_controller_returns_is_described(): void
    {
        $described = $this->itemProperties('taxonomies.category.item');

        unset($described['kizlo']);

        $this->assertSame(
            $this->sorted(array_keys((new WP_REST_Terms_Controller('category'))->get_item_schema()['properties'])),
            $this->sorted(array_keys($described)),
        );
    }

    public function test_every_field_the_terms_controller_accepts_is_described(): void
    {
        $controller = new WP_REST_Terms_Controller('category');

        foreach ([WP_REST_Server::CREATABLE => 'create', WP_REST_Server::EDITABLE => 'update'] as $method => $operation) {
            $this->assertSame(
                $this->sorted(array_keys($controller->get_endpoint_args_for_item_schema($method))),
                $this->sorted(array_keys($this->itemProperties(sprintf('taxonomies.category.%s-input', $operation)))),
                $operation,
            );
        }
    }

    /**
     * The write surface is narrower than the read surface, and the difference is
     * core's `readonly` rather than a rule of Kizlo's. `guid` is the clearest
     * case: every response carries it and no write accepts it.
     */
    public function test_a_readonly_field_is_described_on_the_response_and_not_the_input(): void
    {
        foreach (['guid', 'id', 'link', 'modified', 'type'] as $field) {
            $this->assertArrayHasKey($field, $this->itemProperties('post-types.post.item'), $field);
            $this->assertArrayNotHasKey($field, $this->itemProperties('post-types.post.create-input'), $field);
        }
    }

    // ============================================================
    // THE FIELDS THAT WERE WRONG
    // ============================================================

    /**
     * Added to core in WordPress 6.8 and returned on every public type since,
     * with the contract never mentioning it. This is the failure mode the
     * derivation exists to end: not a field anyone got wrong, a field nobody
     * knew about.
     */
    public function test_a_field_core_added_later_is_described(): void
    {
        $this->assertArrayHasKey('class_list', $this->itemProperties('post-types.post.item'));
    }

    /**
     * `format` was `['type' => 'string']` on both sides, so any value at all was
     * accepted and a client got no vocabulary.
     */
    public function test_the_post_format_vocabulary_comes_from_core(): void
    {
        $expected = array_values(get_post_format_slugs());

        $this->assertSame($expected, $this->itemProperties('post-types.post.item')['format']['enum']);
        $this->assertSame($expected, $this->itemProperties('post-types.post.create-input')['format']['enum']);
    }

    /**
     * The gating that disagreed with core. `WP_REST_Posts_Controller::get_item_schema()`
     * uses a fixed field list for `post`, `page` and `attachment` and never looks
     * at their registered supports, so removing excerpt support took `excerpt`
     * out of the contract while the route carried on returning it and accepting
     * it on write.
     */
    public function test_a_fixed_schema_type_ignores_its_registered_supports(): void
    {
        remove_post_type_support('post', 'excerpt');

        try {
            $this->assertArrayHasKey('excerpt', $this->itemProperties('post-types.post.item'));
            $this->assertArrayHasKey('excerpt', $this->itemProperties('post-types.post.create-input'));
        } finally {
            add_post_type_support('post', 'excerpt');
        }
    }

    /**
     * A type core has no fixed schema for still follows its supports, because
     * core follows them there. Same derivation, opposite answer, neither decided
     * here.
     */
    public function test_a_custom_type_follows_its_registered_supports(): void
    {
        register_post_type('minimal', [
            'public'       => true,
            'show_in_rest' => true,
            'supports'     => ['title'],
        ]);
        kizlo_include_post_type('minimal');
        $this->seedSettings(['post_types' => ['minimal' => ['rest_api_enabled' => true]]]);

        $properties = $this->itemProperties('post-types.minimal.item');

        $this->assertArrayHasKey('title', $properties);
        $this->assertArrayNotHasKey('excerpt', $properties);
        $this->assertArrayNotHasKey('comment_status', $properties);
    }

    /**
     * `meta` was `additionalProperties: true`, which told a client it could send
     * anything. WordPress only reads and writes meta registered with
     * `show_in_rest`, and discards the rest without a word, so the open record was
     * a promise the route does not keep.
     */
    public function test_meta_describes_the_registered_keys_and_nothing_else(): void
    {
        // Empty because Kizlo registers no meta of its own. {@see Document} turns
        // an empty property map into an object, so this reaches a client as `{}`
        // rather than as an array.
        $this->assertSame([], (array) $this->itemProperties('post-types.post.item')['meta']['properties']);

        register_post_meta('post', 'acme_colour', [
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
        ]);

        $meta = $this->itemProperties('post-types.post.item')['meta'];

        $this->assertArrayHasKey('acme_colour', (array) $meta['properties']);
        $this->assertArrayNotHasKey('additionalProperties', $meta);
    }

    /**
     * The taxonomy field core narrows to a single value, which Kizlo described as
     * a bare string. It reaches a generated client as a literal type rather than
     * a string that could be anything.
     */
    public function test_the_term_taxonomy_field_carries_its_single_value_enum(): void
    {
        $this->assertSame(['category'], $this->itemProperties('taxonomies.category.item')['taxonomy']['enum']);
    }

    // ============================================================
    // WHAT KIZLO LAYERS ON TOP
    // ============================================================

    /**
     * WordPress switches its own argument validation off for these three through
     * `arg_options`, which is why the route accepts a bare string as well as the
     * `{ raw }` object the schema describes. Both forms are still described, and
     * the derivation now finds them by that null callback rather than by a list
     * kept here.
     *
     * @dataProvider unvalidatedFieldProvider
     */
    public function test_an_unvalidated_text_field_describes_both_of_its_forms(string $field): void
    {
        $property = $this->itemProperties('post-types.post.create-input')[$field];

        $this->assertArrayNotHasKey('type', $property, 'A union schema carries no sibling type.');

        $types = array_column($property['anyOf'], 'type');
        sort($types);

        $this->assertSame(['object', 'string'], $types);

        $object = $property['anyOf'][array_search('object', array_column($property['anyOf'], 'type'), true)];

        $this->assertSame(['raw'], array_keys($object['properties']));
        $this->assertTrue($object['properties']['raw']['required']);
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function unvalidatedFieldProvider(): array
    {
        return [
            'title'   => ['title'],
            'content' => ['content'],
            'excerpt' => ['excerpt'],
        ];
    }

    /**
     * Only the writable half of that object survives. Core leaves `rendered` and
     * `block_version` in the argument's nested properties even though both are
     * `readonly`, because `rest_get_endpoint_args_for_schema()` only strips
     * readonly at the top level.
     */
    public function test_the_readonly_half_of_a_text_field_is_not_writable(): void
    {
        $object = $this->itemProperties('post-types.post.create-input')['content']['anyOf'][1];

        $this->assertArrayNotHasKey('rendered', $object['properties']);
        $this->assertArrayNotHasKey('block_version', $object['properties']);
    }

    public function test_the_kizlo_envelope_survives_the_derivation(): void
    {
        $envelope = $this->itemProperties('post-types.post.item')['kizlo']['properties'];

        foreach (['url', 'categories', 'tags', 'author', 'featured_media', 'seo', 'extend'] as $key) {
            $this->assertArrayHasKey($key, $envelope, $key);
        }
    }

    /**
     * The envelope's optional blocks follow the derived fields now rather than the
     * settings, because that is what `PostTypeExtension::extendBase()` follows: it
     * reads the author off `$data['author']`, so a type with no author field can
     * never carry an author summary.
     */
    public function test_the_envelope_follows_the_derived_fields(): void
    {
        register_post_type('authorless', [
            'public'       => true,
            'show_in_rest' => true,
            'supports'     => ['title'],
        ]);
        kizlo_include_post_type('authorless');
        $this->seedSettings(['post_types' => ['authorless' => ['rest_api_enabled' => true]]]);

        $envelope = $this->itemProperties('post-types.authorless.item')['kizlo']['properties'];

        $this->assertArrayNotHasKey('author', $envelope);
        $this->assertArrayNotHasKey('featured_media', $envelope);
        $this->assertArrayHasKey('url', $envelope);
    }

    /**
     * Custom fields land at the response root, and a name a WordPress field
     * already holds is skipped rather than overwritten, which is what
     * `CustomFieldsStore::inject()` does. Deriving the WordPress half did not
     * change which side wins.
     */
    public function test_a_custom_field_cannot_displace_a_derived_field(): void
    {
        $this->seedSettings([
            'post_types' => [
                'post' => [
                    'rest_api_enabled' => true,
                    'custom_fields'    => [
                        ['name' => 'acme_note', 'label' => 'Note', 'type' => 'text'],
                        ['name' => 'slug', 'label' => 'Slug', 'type' => 'text'],
                    ],
                ],
            ],
        ]);

        $properties = $this->itemProperties('post-types.post.item');

        $this->assertArrayHasKey('acme_note', $properties);
        $this->assertSame('string', $properties['slug']['type']);
        $this->assertTrue($properties['slug']['required'], 'The WordPress field held its name.');
    }

    public function test_the_status_vocabularies_are_still_named_rather_than_inlined(): void
    {
        $this->assertSame(
            CoreSchemas::POST_STATUS,
            $this->itemProperties('post-types.post.item')['status']['$ref'],
        );

        $this->assertSame(
            CoreSchemas::POST_STATUS_WRITABLE,
            $this->itemProperties('post-types.post.create-input')['status']['$ref'],
        );
    }

    // ============================================================
    // EVERY FIELD IS PRESENT
    // ============================================================

    /**
     * `prepare_item_for_response()` populates every schema property it is not
     * asked to skip, and with the context pinned nothing is skipped. So a response
     * field is either always there or not described, and there is no third state
     * for a client to handle.
     */
    public function test_every_described_response_field_is_required(): void
    {
        foreach ($this->itemProperties('post-types.post.item') as $name => $property) {
            $this->assertTrue($property['required'] ?? false, sprintf('"%s" should always be present.', $name));
        }
    }

    /**
     * The write side keeps core's own answer instead, which is not the same
     * answer: a term must be named on create and need not be on update.
     */
    public function test_the_input_keeps_core_s_own_required_fields(): void
    {
        $this->assertTrue($this->itemProperties('taxonomies.category.create-input')['name']['required']);
        $this->assertArrayNotHasKey('required', $this->itemProperties('taxonomies.category.update-input')['name']);
    }

    // ============================================================
    // FIELDS FROM OUTSIDE KIZLO
    // ============================================================

    /**
     * A field another plugin adds is contract surface too, on the same terms as a
     * third-party collection parameter. `register_rest_field()` rather than the
     * schema filter because that is the path core supports: adding a property
     * through `rest_{$post_type}_item_schema` earns a `_doing_it_wrong` from
     * `get_item_schema()` itself.
     */
    public function test_a_third_party_field_reaches_the_contract(): void
    {
        register_rest_field('post', 'acme_channel', [
            'schema' => [
                'type'    => 'string',
                'enum'    => ['web', 'print'],
                'context' => ['view', 'edit'],
            ],
        ]);

        $this->assertArrayHasKey('acme_channel', $this->itemProperties('post-types.post.item'));
        $this->assertArrayHasKey('acme_channel', $this->itemProperties('post-types.post.create-input'));
    }

    /**
     * And one that cannot be expressed is reported rather than dropped in silence,
     * which is the whole difference between a derived contract and a hand-written
     * one falling behind.
     */
    public function test_an_untranslatable_third_party_field_is_reported(): void
    {
        register_rest_field('post', 'acme_broken', [
            'schema' => ['description' => 'No type, so nothing could be enforced.'],
        ]);

        $this->assertArrayNotHasKey('acme_broken', $this->itemProperties('post-types.post.item'));
        $this->assertErrorContains($this->errors(), 'acme_broken');
    }

    // ============================================================
    // THE DERIVED VALIDATION IS ENFORCED
    // ============================================================

    /**
     * Core has no enum for `template`; it validates through
     * `arg_options.validate_callback`, which checks the value against the
     * templates the theme registers. Deriving the write surface carries that
     * callback onto the managed route, where the value used to reach
     * `handle_template(..., true)` and be swapped for an empty string behind a
     * 201. The same shape of defect as the status one KIZ-71 closed: not a
     * refusal, a silent substitution.
     */
    public function test_an_unknown_template_is_refused_the_way_core_refuses_it(): void
    {
        $this->boot();

        $managed = $this->create('/kizlo/v1/post-types/post', ['title' => 'probe', 'template' => 'nope.php']);
        $core    = $this->create('/wp/v2/posts', ['title' => 'probe', 'template' => 'nope.php']);

        $this->assertSame(400, $managed->get_status());
        $this->assertSame($core->get_status(), $managed->get_status());
    }

    public function test_a_post_without_a_template_still_creates(): void
    {
        $this->boot();

        $this->assertSame(201, $this->create('/kizlo/v1/post-types/post', ['title' => 'probe'])->get_status());
    }

    /**
     * The carried callbacks are PHP callables. The runtime schema map needs them
     * so {@see \Kizlo\Modules\Introspection\ArgTranslator} can put them back on
     * the route, and the document must never see one: it would not serialize, and
     * it would publish controller internals if it did.
     */
    public function test_the_emitted_document_carries_no_callables(): void
    {
        $this->assertStringNotContainsString('callback', (string) wp_json_encode($this->document()));
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * @return array<string, array<string, mixed>>
     */
    private function itemProperties(string $schemaId): array
    {
        return $this->document()['schemas'][$schemaId]['properties'];
    }

    private function boot(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();

        do_action('rest_api_init', $wp_rest_server);
    }

    /**
     * @param array<string, mixed> $body
     */
    private function create(string $route, array $body): \WP_REST_Response
    {
        $request = new WP_REST_Request('POST', $route);
        $request->set_header('content-type', 'application/json');
        $request->set_body((string) wp_json_encode($body));

        return $GLOBALS['wp_rest_server']->dispatch($request);
    }

    /**
     * @param array<int, string> $names
     * @return array<int, string>
     */
    private function sorted(array $names): array
    {
        sort($names);

        return $names;
    }
}
