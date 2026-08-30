<?php

namespace Kizlo\Tests\CustomFields;

use InvalidArgumentException;
use Kizlo\Tests\TestCase;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\CustomFields\CustomFieldsStore;

/**
 * The ACF-style storage engine: nested input flattens into readable `kcf_*` meta
 * with `_kcf_*` definition references, repeaters store a row count and indexed
 * children (reindexing on shrink), and reads resolve back to the nested output
 * shape with media, defaults and orphan exclusion.
 */
class CustomFieldsStoreTest extends TestCase
{
    private int $post;

    protected function setUp(): void
    {
        parent::setUp();
        $this->post = self::factory()->post->create();
    }

    /**
     * @param array<int, array<string, mixed>> $raw
     * @return array<int, array<string, mixed>>
     */
    private function defs(array $raw): array
    {
        return FieldDefinitions::normalize($raw);
    }

    private function write(array $defs, array $values): void
    {
        CustomFieldsStore::write(CustomFieldsStore::META_POST, $this->post, $defs, $values);
    }

    private function read(array $defs): array
    {
        return CustomFieldsStore::read(CustomFieldsStore::META_POST, $this->post, $defs);
    }

    public function test_simple_field_round_trips_and_stores_the_reference_key(): void
    {
        $defs = $this->defs([['type' => 'text', 'name' => 'company_name']]);

        $this->write($defs, ['company_name' => 'Acme Ltd']);

        $this->assertSame('Acme Ltd', get_post_meta($this->post, 'kcf_company_name', true));
        $this->assertSame($defs[0]['key'], get_post_meta($this->post, '_kcf_company_name', true));
        $this->assertSame(['company_name' => 'Acme Ltd'], $this->read($defs));
    }

    public function test_group_children_flatten_under_the_group_name(): void
    {
        $defs = $this->defs([
            ['type' => 'group', 'name' => 'hero', 'fields' => [['type' => 'text', 'name' => 'title']]],
        ]);

        $this->write($defs, ['hero' => ['title' => 'Welcome']]);

        $this->assertSame('Welcome', get_post_meta($this->post, 'kcf_hero_title', true));
        $this->assertSame(['hero' => ['title' => 'Welcome']], $this->read($defs));
    }

    public function test_repeater_stores_a_count_and_indexed_children(): void
    {
        $defs = $this->defs([
            ['type' => 'repeater', 'name' => 'features', 'fields' => [['type' => 'text', 'name' => 'title']]],
        ]);

        $this->write($defs, ['features' => [['title' => 'Fast'], ['title' => 'Secure']]]);

        $this->assertSame('2', get_post_meta($this->post, 'kcf_features', true));
        $this->assertSame('Fast', get_post_meta($this->post, 'kcf_features_0_title', true));
        $this->assertSame('Secure', get_post_meta($this->post, 'kcf_features_1_title', true));
        $this->assertSame(
            ['features' => [['title' => 'Fast'], ['title' => 'Secure']]],
            $this->read($defs)
        );
    }

    public function test_shrinking_a_repeater_reindexes_and_cleans_obsolete_rows(): void
    {
        $defs = $this->defs([
            ['type' => 'repeater', 'name' => 'features', 'fields' => [['type' => 'text', 'name' => 'title']]],
        ]);

        $this->write($defs, ['features' => [['title' => 'Fast'], ['title' => 'Secure']]]);
        $this->write($defs, ['features' => [['title' => 'Only']]]);

        $this->assertSame('1', get_post_meta($this->post, 'kcf_features', true));
        $this->assertSame('Only', get_post_meta($this->post, 'kcf_features_0_title', true));
        $this->assertSame('', get_post_meta($this->post, 'kcf_features_1_title', true));
        $this->assertCount(1, $this->read($defs)['features']);
    }

    public function test_nested_repeaters_flatten_with_compound_keys(): void
    {
        $defs = $this->defs([
            [
                'type'   => 'repeater',
                'name'   => 'sections',
                'fields' => [
                    ['type' => 'repeater', 'name' => 'columns', 'fields' => [['type' => 'text', 'name' => 'title']]],
                ],
            ],
        ]);

        $this->write($defs, ['sections' => [['columns' => [['title' => 'A'], ['title' => 'B']]]]]);

        $this->assertSame('2', get_post_meta($this->post, 'kcf_sections_0_columns', true));
        $this->assertSame('A', get_post_meta($this->post, 'kcf_sections_0_columns_0_title', true));
        $this->assertSame('B', get_post_meta($this->post, 'kcf_sections_0_columns_1_title', true));
        $this->assertSame(
            ['sections' => [['columns' => [['title' => 'A'], ['title' => 'B']]]]],
            $this->read($defs)
        );
    }

    public function test_deleting_a_definition_preserves_the_value_for_recovery(): void
    {
        $original  = $this->defs([['type' => 'text', 'name' => 'tagline']]);
        $this->write($original, ['tagline' => 'Keep me']);

        // Definition removed: read excludes the orphaned value, but it stays in meta.
        $this->assertSame([], $this->read($this->defs([])));
        $this->assertSame('Keep me', get_post_meta($this->post, 'kcf_tagline', true));

        // Recreating the same name at the same path recovers the preserved value.
        $recreated = $this->defs([['type' => 'text', 'name' => 'tagline']]);
        $this->assertSame(['tagline' => 'Keep me'], $this->read($recreated));
    }

    public function test_recreating_with_a_new_type_reinterprets_the_raw_value(): void
    {
        $this->write($this->defs([['type' => 'text', 'name' => 'score']]), ['score' => '42']);

        $asNumber = $this->read($this->defs([['type' => 'number', 'name' => 'score']]));

        $this->assertSame(42, $asNumber['score']);
    }

    public function test_media_ids_resolve_to_media_objects_on_read(): void
    {
        $attachment = self::factory()->attachment->create_upload_object(DIR_TESTDATA . '/images/canola.jpg');
        $defs       = $this->defs([['type' => 'image', 'name' => 'hero_image']]);

        $this->write($defs, ['hero_image' => $attachment]);

        $this->assertSame((string) $attachment, get_post_meta($this->post, 'kcf_hero_image', true));

        $value = $this->read($defs)['hero_image'];
        $this->assertIsArray($value);
        $this->assertSame('image', $value['type']);
        $this->assertSame($attachment, $value['id']);
        $this->assertArrayHasKey('src', $value);
    }

    public function test_file_fields_resolve_non_image_attachments_as_union_members(): void
    {
        $attachment = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => 'application/pdf',
            'post_status'    => 'inherit',
        ]);
        update_post_meta($attachment, '_wp_attached_file', '2026/08/manual.pdf');

        $defs = $this->defs([['type' => 'file', 'name' => 'manual']]);
        $this->write($defs, ['manual' => $attachment]);

        $value = $this->read($defs)['manual'];
        $this->assertSame('file', $value['type']);
        $this->assertSame($attachment, $value['id']);
        $this->assertArrayNotHasKey('alt', $value);
    }

    public function test_image_fields_never_read_back_non_image_members(): void
    {
        $attachment = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => 'video/mp4',
            'post_status'    => 'inherit',
        ]);
        $defs = $this->defs([['type' => 'image', 'name' => 'hero_image']]);

        update_post_meta($this->post, 'kcf_hero_image', $attachment);

        $this->assertNull($this->read($defs)['hero_image']);
    }

    public function test_unset_fields_fall_back_to_configured_defaults(): void
    {
        $defs = $this->defs([
            ['type' => 'text', 'name' => 'subtitle', 'default' => 'Untitled'],
            ['type' => 'toggle', 'name' => 'featured', 'default' => true],
            ['type' => 'number', 'name' => 'rank'],
        ]);

        $read = $this->read($defs);

        $this->assertSame('Untitled', $read['subtitle']);
        $this->assertTrue($read['featured']);
        $this->assertNull($read['rank']);
    }

    public function test_a_legacy_collision_is_rejected_before_any_meta_is_written(): void
    {
        $defs = $this->defs([
            ['type' => 'text', 'name' => 'a_b'],
            ['type' => 'group', 'name' => 'a', 'fields' => [['type' => 'text', 'name' => 'b']]],
        ]);

        try {
            $this->write($defs, ['a_b' => 'first', 'a' => ['b' => 'second']]);
            $this->fail('Expected colliding storage paths to be rejected.');
        } catch (InvalidArgumentException $error) {
            $this->assertStringContainsString('collide', $error->getMessage());
        }

        $this->assertSame('', get_post_meta($this->post, 'kcf_a_b', true));
    }
}
