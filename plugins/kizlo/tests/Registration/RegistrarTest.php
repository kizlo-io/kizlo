<?php

namespace Kizlo\Tests\Registration;

use Kizlo\Modules\Registration\PostTypeRegistration;
use Kizlo\Modules\Registration\Registrar;
use Kizlo\Modules\Registration\TaxonomyRegistration;
use Kizlo\Tests\TestCase;

/**
 * The registrar registers active definitions, opts them into the pipeline, skips
 * inactive ones, and never registers over an object another plugin already owns.
 */
class RegistrarTest extends TestCase
{
    protected function tearDown(): void
    {
        foreach (['book', 'movie'] as $post_type) {
            if (post_type_exists($post_type)) {
                unregister_post_type($post_type);
            }
        }

        if (taxonomy_exists('genre')) {
            unregister_taxonomy('genre');
        }

        parent::tearDown();
    }

    private function savePostType(string $key, bool $active): void
    {
        $definition = new PostTypeRegistration();
        $definition->setData(['key' => $key, 'singular_label' => ucfirst($key), 'plural_label' => ucfirst($key) . 's', 'active' => $active]);
        $definition->save($key);
    }

    public function test_active_definitions_are_registered(): void
    {
        $this->savePostType('book', true);

        (new Registrar())->registerObjects();

        $this->assertTrue(post_type_exists('book'));
        $this->assertTrue(get_post_type_object('book')->show_in_rest);
    }

    public function test_inactive_definitions_are_not_registered(): void
    {
        $this->savePostType('movie', false);

        (new Registrar())->registerObjects();

        $this->assertFalse(post_type_exists('movie'));
    }

    public function test_active_keys_are_added_to_the_inclusion_filters(): void
    {
        $this->savePostType('book', true);
        $this->savePostType('movie', false);

        $taxonomy = new TaxonomyRegistration();
        $taxonomy->setData(['key' => 'genre', 'singular_label' => 'Genre', 'plural_label' => 'Genres', 'active' => true]);
        $taxonomy->save('genre');

        (new Registrar())->register();

        $post_types = apply_filters('kizlo_included_post_types', []);
        $taxonomies = apply_filters('kizlo_included_taxonomies', []);

        $this->assertContains('book', $post_types);
        $this->assertNotContains('movie', $post_types);
        $this->assertContains('genre', $taxonomies);
    }

    public function test_an_existing_object_is_never_overwritten(): void
    {
        register_post_type('book', ['label' => 'Third Party Books', 'public' => true]);

        $this->savePostType('book', true);

        (new Registrar())->registerObjects();

        // The pre-existing registration wins.
        $this->assertSame('Third Party Books', get_post_type_object('book')->label);
    }
}
