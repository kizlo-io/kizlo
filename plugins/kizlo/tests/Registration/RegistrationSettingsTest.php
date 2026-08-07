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

    public function test_put_updates_definition_and_settings_in_one_request(): void
    {
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));

        $definition = new PostTypeRegistration();
        $definition->setData(['key' => 'book', 'singular_label' => 'Book', 'plural_label' => 'Books', 'active' => true, 'supports' => ['title']]);
        $definition->save('book');

        // One payload carries both a definition field (supports) and a settings
        // field (seo_enabled); each object keeps only the keys it declares.
        $request = new \WP_REST_Request('PUT', '/kizlo/v1/settings/post_types/book');
        $request->set_header('Content-Type', 'application/json');
        $request->set_body(wp_json_encode(['supports' => ['title', 'editor', 'thumbnail'], 'seo_enabled' => true]));

        $response = rest_get_server()->dispatch($request);

        $this->assertSame(200, $response->get_status());
        $this->assertTrue(PostTypeSettings::load('book')->getSeoEnabled());
        $this->assertSame(['title', 'editor', 'thumbnail'], PostTypeRegistration::load('book')->getData()['supports']);
    }

    public function test_post_creates_a_definition(): void
    {
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));

        $request = new \WP_REST_Request('POST', '/kizlo/v1/settings/post_types');
        $request->set_header('Content-Type', 'application/json');
        $request->set_body(wp_json_encode(['key' => 'book', 'singular_label' => 'Book', 'plural_label' => 'Books']));

        $response = rest_get_server()->dispatch($request);

        $this->assertSame(201, $response->get_status());
        $this->assertSame('book', $response->get_data()['slug']);
        $this->assertTrue(PostTypeRegistration::exists('book'));
    }
}
