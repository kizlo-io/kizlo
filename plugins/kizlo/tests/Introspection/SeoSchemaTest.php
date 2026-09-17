<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\Introspection\ArgTranslator;
use Kizlo\Modules\Introspection\CoreSchemas;

/**
 * SEO typed differently per direction: one `seo` key carrying the resolved block
 * on the way out and the authored overrides on the way in, the same shape
 * `status` already uses through `kizlo.post-status-writable`.
 *
 * Both sides sit inside the `kizlo` envelope, so a caller sends SEO back at the
 * path it read it from. The input schema is closed, which is what turns a
 * misspelled field — or a post-only one sent to a term — into a 400 rather than a
 * silently ignored no-op.
 */
class SeoSchemaTest extends IntrospectionTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
    }

    /** @return array<string, mixed> */
    private function schemas(): array
    {
        return $this->document()['schemas'];
    }

    // ============================================================
    // THE INPUT SIDE
    // ============================================================

    /** @dataProvider writeInputProvider */
    public function test_post_writes_carry_the_seo_input_inside_the_kizlo_envelope(string $id): void
    {
        $envelope = $this->schemas()[$id]['properties']['kizlo'];

        $this->assertSame(['$ref' => CoreSchemas::SEO_INPUT], $envelope['properties']['seo']);
        $this->assertArrayNotHasKey('seo', $this->schemas()[$id]['properties'], 'Never at the top level.');
    }

    /** @return array<string, array{0: string}> */
    public function writeInputProvider(): array
    {
        return [
            'create' => ['post-types.post.create-input'],
            'update' => ['post-types.post.update-input'],
        ];
    }

    /** @dataProvider termWriteInputProvider */
    public function test_term_writes_carry_the_term_seo_input_inside_the_kizlo_envelope(string $id): void
    {
        $envelope = $this->schemas()[$id]['properties']['kizlo'];

        $this->assertSame(['$ref' => CoreSchemas::TERM_SEO_INPUT], $envelope['properties']['seo']);
    }

    /** @return array<string, array{0: string}> */
    public function termWriteInputProvider(): array
    {
        return [
            'create' => ['taxonomies.category.create-input'],
            'update' => ['taxonomies.category.update-input'],
        ];
    }

    public function test_the_input_schema_is_closed_and_every_field_optional(): void
    {
        $schema = $this->schemas()[CoreSchemas::SEO_INPUT];

        $this->assertFalse($schema['additionalProperties']);

        foreach ($schema['properties'] as $name => $property) {
            $this->assertArrayNotHasKey('required', $property, "\"{$name}\" must stay optional.");
        }

        foreach (['og', 'twitter'] as $group) {
            $this->assertFalse($schema['properties'][$group]['additionalProperties']);
            $this->assertSame(
                ['title', 'description', 'image_id'],
                array_keys($schema['properties'][$group]['properties'])
            );
        }
    }

    public function test_the_input_schema_covers_every_override_field(): void
    {
        $schema = $this->schemas()[CoreSchemas::SEO_INPUT];

        $this->assertSame(
            ['title', 'description', 'canonical', 'webpage_type', 'article_type', 'noindex', 'nofollow', 'og', 'twitter'],
            array_keys($schema['properties'])
        );
    }

    public function test_the_term_input_drops_the_post_only_type_fields(): void
    {
        $schema = $this->schemas()[CoreSchemas::TERM_SEO_INPUT];

        // A term always resolves to a CollectionPage, so neither schema.org type
        // field means anything on one.
        $this->assertArrayNotHasKey('webpage_type', $schema['properties']);
        $this->assertArrayNotHasKey('article_type', $schema['properties']);
        $this->assertArrayHasKey('title', $schema['properties']);
        $this->assertArrayHasKey('og', $schema['properties']);
    }

    // ============================================================
    // WHAT WORDPRESS ACTUALLY ENFORCES
    // ============================================================

    /**
     * The contract is only worth what `rest_validate_value_from_schema()` does
     * with it, and it reads the resolved args rather than the document. These
     * drive the translated argument the route is really registered with.
     *
     * @return array<string, mixed>
     */
    private function kizloArg(string $id): array
    {
        $schemas = $this->schemas();
        $args    = ArgTranslator::toArgs($schemas[$id], $schemas);

        return $args['kizlo'];
    }

    public function test_an_unrecognised_seo_field_is_rejected(): void
    {
        $result = rest_validate_value_from_schema(
            ['seo' => ['titel' => 'Typo']],
            $this->kizloArg('post-types.post.create-input'),
            'kizlo'
        );

        $this->assertWPError($result);
    }

    public function test_a_post_only_type_field_sent_to_a_term_is_rejected(): void
    {
        $result = rest_validate_value_from_schema(
            ['seo' => ['webpage_type' => 'AboutPage']],
            $this->kizloArg('taxonomies.category.create-input'),
            'kizlo'
        );

        $this->assertWPError($result, 'A field that would do nothing is an error, not a silent no-op.');
    }

    public function test_the_same_field_is_accepted_on_a_post(): void
    {
        $result = rest_validate_value_from_schema(
            ['seo' => ['webpage_type' => 'AboutPage', 'og' => ['image_id' => 12]]],
            $this->kizloArg('post-types.post.create-input'),
            'kizlo'
        );

        $this->assertTrue($result);
    }

    // ============================================================
    // THE RESPONSE SIDE IS UNCHANGED
    // ============================================================

    public function test_the_item_response_still_references_the_resolved_seo_block(): void
    {
        $item = $this->schemas()['post-types.post.item']['properties']['kizlo']['properties']['seo'];

        $this->assertSame(CoreSchemas::SEO, $item['$ref']);
        $this->assertTrue($item['required']);
    }

    public function test_the_resolved_seo_block_keeps_its_shape(): void
    {
        $seo = $this->schemas()[CoreSchemas::SEO];

        // The write side is a separate schema, so nothing about it may leak here.
        $this->assertSame(['head', 'schema'], array_keys($seo['properties']));
        $this->assertArrayNotHasKey('additionalProperties', $seo);
    }
}
