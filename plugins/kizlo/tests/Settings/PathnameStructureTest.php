<?php

namespace Kizlo\Tests\Settings;

use WP_REST_Request;
use Kizlo\Tests\TestCase;
use Kizlo\Support\Variables;
use Kizlo\Modules\Settings\Authors\AuthorsSettings;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;

class PathnameStructureTest extends TestCase
{
    /** @dataProvider pathnameSettings */
    public function test_pathname_structure_is_lowercased(string $setting): void
    {
        $this->assertSame('/integrations/{{slug}}', $this->store($setting, '/Integrations/{{slug}}'));
    }

    /** @dataProvider pathnameSettings */
    public function test_pathname_structure_slashes_and_whitespace_are_normalized(string $setting): void
    {
        $this->assertSame('/integrations/{{slug}}', $this->store($setting, 'integrations/{{slug}}'));
        $this->assertSame('/integrations/{{slug}}', $this->store($setting, '//integrations//{{slug}}'));
        $this->assertSame('/integrations/{{slug}}', $this->store($setting, '/integrations/{{slug}}/'));
        $this->assertSame('/integrations/{{slug}}', $this->store($setting, '  /Integrations/{{slug}}  '));
    }

    /** @dataProvider pathnameSettings */
    public function test_empty_pathname_structure_is_stored_as_null(string $setting): void
    {
        $this->assertNull($this->store($setting, ''));
        $this->assertNull($this->store($setting, '   '));
        $this->assertNull($this->store($setting, '/'));
        $this->assertNull($this->store($setting, null));
    }

    /** @dataProvider pathnameSettings */
    public function test_already_normalized_pathname_structure_is_stored_unchanged(string $setting): void
    {
        $this->assertSame('/integrations/{{slug}}', $this->store($setting, '/integrations/{{slug}}'));
    }

    public function test_normalized_pathname_structure_keeps_its_tokens_resolvable(): void
    {
        $stored = $this->store('post_type', '/Integrations/{{year}}/{{slug}}');

        $this->assertSame('/integrations/{{year}}/{{slug}}', $stored);
        $this->assertSame(
            '/integrations/2026/headless-wordpress',
            Variables::resolve($stored, ['year' => '2026', 'slug' => 'headless-wordpress'])
        );
    }

    public function test_rest_update_stores_and_returns_the_normalized_structure(): void
    {
        $this->actingAsAdmin();

        $request = new WP_REST_Request('PUT', '/kizlo/v1/settings/post_types/post');
        $request->set_header('Content-Type', 'application/json');
        $request->set_body(wp_json_encode([
            'pathname_structure'       => '/Integrations/{{slug}}',
            'title_structure'          => '{{title}}',
            'description_structure'    => '{{content}}',
            'search_engine_visibility' => true,
            'seo_enabled'              => true,
            'rest_api_enabled'         => true,
            'breadcrumbs'              => [],
            'custom_fields'            => [],
            'webpage_type'             => 'WebPage',
            'article_type'             => 'Article',
            'comment_action_structure' => null,
        ]));

        $response = rest_get_server()->dispatch($request);

        $this->assertSame(200, $response->get_status(), wp_json_encode($response->get_data()));
        $this->assertSame('/integrations/{{slug}}', $response->get_data()['pathname_structure']);
        $this->assertSame('/integrations/{{slug}}', PostTypeSettings::load('post')->getPathnameStructure());
    }

    public static function pathnameSettings(): array
    {
        return [
            'post type' => ['post_type'],
            'taxonomy'  => ['taxonomy'],
            'authors'   => ['authors'],
        ];
    }

    /** Save a raw structure through the settings layer and return what was stored. */
    private function store(string $setting, ?string $value): ?string
    {
        $settings = match ($setting) {
            'post_type' => PostTypeSettings::load('post'),
            'taxonomy'  => TaxonomySettings::load('category'),
            'authors'   => AuthorsSettings::load(),
        };

        return $settings->setData(['pathname_structure' => $value])->getPathnameStructure();
    }
}
