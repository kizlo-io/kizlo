<?php

namespace Kizlo\Tests\Registration;

use Kizlo\Modules\Registration\PostTypeRegistration;
use Kizlo\Modules\Registration\TaxonomyRegistration;
use Kizlo\Tests\TestCase;

/**
 * A definition maps to WordPress registration arguments. show_in_rest is always
 * forced on and the unsafe low-level inputs are never emitted.
 */
class RegistrationArgsTest extends TestCase
{
    public function test_post_type_args_force_rest_and_map_options(): void
    {
        $definition = new PostTypeRegistration();
        $definition->setData([
            'key'             => 'book',
            'singular_label'  => 'Book',
            'plural_label'    => 'Books',
            'hierarchical'    => true,
            'supports'        => ['title', 'editor', 'custom-fields'],
            'capability_type' => 'custom',
        ]);

        $args = $definition->toArgs();

        $this->assertTrue($args['show_in_rest']);
        $this->assertTrue($args['hierarchical']);
        $this->assertSame(['book', 'books'], $args['capability_type']);
        $this->assertTrue($args['map_meta_cap']);

        // The legacy custom-fields metabox is never registered.
        $this->assertNotContains('custom-fields', $args['supports']);
        $this->assertContains('title', $args['supports']);

        // WordPress-frontend URL machinery is never emitted; Kizlo is headless.
        $this->assertArrayNotHasKey('has_archive', $args);
        $this->assertArrayNotHasKey('rewrite', $args);
        $this->assertArrayNotHasKey('rest_base', $args);

        // No unsafe low-level inputs.
        $this->assertArrayNotHasKey('register_meta_box_cb', $args);
        $this->assertArrayNotHasKey('rest_controller_class', $args);
    }

    public function test_taxonomy_args_force_rest_and_map_meta_box(): void
    {
        $definition = new TaxonomyRegistration();
        $definition->setData([
            'key'                => 'genre',
            'singular_label'     => 'Genre',
            'plural_label'       => 'Genres',
            'meta_box'           => 'category',
            'default_term_name'  => 'Uncategorized',
        ]);

        $args = $definition->toArgs();

        $this->assertTrue($args['show_in_rest']);
        $this->assertSame('post_categories_meta_box', $args['meta_box_cb']);
        $this->assertSame('Uncategorized', $args['default_term']['name']);

        // WordPress-frontend URL machinery is never emitted; Kizlo is headless.
        $this->assertArrayNotHasKey('rewrite', $args);
        $this->assertArrayNotHasKey('rest_base', $args);
    }

    public function test_hidden_meta_box_maps_to_false(): void
    {
        $definition = new TaxonomyRegistration();
        $definition->setData(['key' => 'genre', 'meta_box' => 'hidden']);

        $this->assertFalse($definition->toArgs()['meta_box_cb']);
    }
}
