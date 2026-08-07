<?php

namespace Kizlo\Tests\Registration;

use Kizlo\Modules\Registration\PostTypeRegistration;
use Kizlo\Modules\Registration\TaxonomyRegistration;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Modules\Settings\PostType\PostTypeSettingsService;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettingsService;
use Kizlo\Tests\TestCase;
use WP_Post_Type;
use WP_Taxonomy;

/**
 * Inactive Kizlo definitions have no runtime object but stay navigable and
 * editable: settings loading synthesizes them and the response marks them owned.
 */
class RegistrationSettingsTest extends TestCase
{
    public function test_inactive_post_type_is_available_and_marked_owned(): void
    {
        $definition = new PostTypeRegistration();
        $definition->setData(['key' => 'book', 'singular_label' => 'Book', 'plural_label' => 'Books', 'active' => false, 'supports' => ['title']]);
        $definition->save('book');

        $available = PostTypeSettings::getAvailableObjects();

        $this->assertArrayHasKey('book', $available);
        $this->assertInstanceOf(WP_Post_Type::class, $available['book']);
        $this->assertTrue($available['book']->show_in_rest);

        $item = (new PostTypeSettingsService())->toItemResponse($available['book'], PostTypeSettings::load('book'));

        $this->assertTrue($item['kizlo_owned']);
        $this->assertFalse($item['active']);
        $this->assertSame('book', $item['registration']['key']);
        $this->assertTrue($item['supports']['title']);
        $this->assertFalse($item['supports']['editor']);
    }

    public function test_inactive_taxonomy_is_available_and_marked_owned(): void
    {
        $definition = new TaxonomyRegistration();
        $definition->setData(['key' => 'genre', 'singular_label' => 'Genre', 'plural_label' => 'Genres', 'active' => false]);
        $definition->save('genre');

        $available = TaxonomySettings::getAvailableObjects();

        $this->assertArrayHasKey('genre', $available);
        $this->assertInstanceOf(WP_Taxonomy::class, $available['genre']);

        $item = (new TaxonomySettingsService())->toItemResponse($available['genre'], TaxonomySettings::load('genre'));

        $this->assertTrue($item['kizlo_owned']);
        $this->assertFalse($item['active']);
        $this->assertSame('genre', $item['registration']['key']);
    }

    public function test_core_post_type_is_not_marked_owned(): void
    {
        $item = (new PostTypeSettingsService())->toItemResponse(get_post_type_object('post'), PostTypeSettings::load('post'));

        $this->assertFalse($item['kizlo_owned']);
        $this->assertTrue($item['active']);
        $this->assertNull($item['registration']);
    }

    public function test_settings_can_be_edited_for_an_inactive_definition(): void
    {
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));

        $definition = new PostTypeRegistration();
        $definition->setData(['key' => 'book', 'singular_label' => 'Book', 'plural_label' => 'Books', 'active' => false]);
        $definition->save('book');

        // The runtime object does not exist for an inactive definition, but the
        // per-slug settings PUT must still succeed against the synthesized object.
        $request = new \WP_REST_Request('PUT', '/kizlo/v1/settings/post_types/book');
        $request->set_header('Content-Type', 'application/json');
        $request->set_body(wp_json_encode(['seo_enabled' => true]));

        $response = rest_get_server()->dispatch($request);

        $this->assertSame(200, $response->get_status());
        $this->assertTrue($response->get_data()['seo_enabled']);
        $this->assertTrue($response->get_data()['kizlo_owned']);
        $this->assertFalse($response->get_data()['active']);
    }
}
