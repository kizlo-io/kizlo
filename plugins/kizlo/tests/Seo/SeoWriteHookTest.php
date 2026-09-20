<?php

namespace Kizlo\Tests\Seo;

use Kizlo\Modules\Seo\SeoModule;
use Kizlo\Modules\Settings\Settings;

/**
 * When the SEO override write hooks are attached.
 *
 * One `rest_after_insert_{$type}` per managed object, so the module has to know the
 * managed set, and that is only complete after `Registrar::registerObjects()` on
 * `init`. Attaching during boot was worse here than elsewhere: the route still
 * accepted a `kizlo.seo` payload and answered success, and the override was then
 * dropped because nothing was listening for the object it was written to.
 */
class SeoWriteHookTest extends SeoTestCase
{
    public function test_post_type_write_hooks_are_attached_on_init_rather_than_at_registration(): void
    {
        register_post_type('book', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_post_types', static fn(array $types): array => $types + ['book' => []]);

        // A fresh request's settings state, so the managed set is there to be read.
        Settings::invalidateCache();

        $module = new SeoModule();
        $module->register();

        $this->assertFalse(has_action('rest_after_insert_book'), 'Registration alone must not read the managed set.');

        $module->registerWriteHooks();

        $this->assertNotFalse(has_action('rest_after_insert_book'));
    }

    public function test_taxonomy_write_hooks_are_attached_on_init_rather_than_at_registration(): void
    {
        register_taxonomy('genre', 'post', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_taxonomies', static fn(array $taxonomies): array => $taxonomies + ['genre' => []]);
        Settings::invalidateCache();

        $module = new SeoModule();
        $module->register();

        $this->assertFalse(has_action('rest_after_insert_genre'), 'Registration alone must not read the managed set.');

        $module->registerWriteHooks();

        $this->assertNotFalse(has_action('rest_after_insert_genre'));
    }
}
