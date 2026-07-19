<?php

namespace Kizlo\Tests\Settings;

use Kizlo\Tests\TestCase;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Modules\Settings\PostType\PostTypeSettingsService;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettingsService;

/**
 * The settings response shape: a single post type/taxonomy is serialized by merging
 * its runtime metadata with its saved settings, and the read-only publicly_queryable
 * flag is no longer exposed on either surface.
 */
class SettingsResponseTest extends TestCase
{
    public function test_post_type_response_merges_metadata_and_saved_settings(): void
    {
        $settings = PostTypeSettings::load('post');
        $settings->setData(['title_structure' => '%%title%%']);

        $response = (new PostTypeSettingsService())->toItemResponse(get_post_type_object('post'), $settings);

        $this->assertSame('post', $response['slug']);
        $this->assertArrayHasKey('supports', $response);
        $this->assertArrayHasKey('content_variables', $response);
        $this->assertSame('%%title%%', $response['title_structure']);
    }

    public function test_post_type_response_omits_publicly_queryable(): void
    {
        $response = (new PostTypeSettingsService())->toItemResponse(get_post_type_object('post'), PostTypeSettings::load('post'));

        $this->assertArrayNotHasKey('publicly_queryable', $response);
    }

    public function test_taxonomy_response_merges_metadata_and_omits_publicly_queryable(): void
    {
        $response = (new TaxonomySettingsService())->toItemResponse(get_taxonomy('category'), TaxonomySettings::load('category'));

        $this->assertSame('category', $response['slug']);
        $this->assertArrayNotHasKey('publicly_queryable', $response);
    }
}
