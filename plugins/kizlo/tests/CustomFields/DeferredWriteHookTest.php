<?php

namespace Kizlo\Tests\CustomFields;

use Kizlo\Modules\CustomFields\CustomFieldsModule;
use Kizlo\Modules\CustomFields\TermCustomFieldsForm;
use Kizlo\Modules\Settings\Settings;
use Kizlo\Tests\TestCase;

/**
 * When the custom-field write hooks are attached.
 *
 * The module hooks `rest_after_insert_{$type}` once per managed object, so it has to
 * know the managed set. That set is only complete after `Registrar::registerObjects()`
 * on `init`: an object an extension plugin contributes is not in it while core is
 * still booting. Attaching during boot therefore skipped those objects silently, and
 * a write to one of them was accepted and then dropped.
 */
class DeferredWriteHookTest extends TestCase
{
    public function test_write_hooks_are_attached_on_init_rather_than_at_registration(): void
    {
        register_post_type('book', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_post_types', static fn(array $types): array => $types + ['book' => []]);

        // A fresh request's settings state, so the managed set is there to be read.
        Settings::invalidateCache();

        $module = new CustomFieldsModule();
        $module->register();

        $this->assertFalse(has_action('rest_after_insert_book'), 'Registration alone must not read the managed set.');

        $module->registerWriteHooks();

        $this->assertNotFalse(has_action('rest_after_insert_book'));
    }

    public function test_a_contributed_taxonomy_gets_its_write_hook(): void
    {
        register_taxonomy('genre', 'post', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_taxonomies', static fn(array $taxonomies): array => $taxonomies + ['genre' => []]);
        Settings::invalidateCache();

        (new CustomFieldsModule())->registerWriteHooks();

        $this->assertNotFalse(has_action('rest_after_insert_genre'));
    }

    public function test_term_form_fields_are_attached_on_init_rather_than_at_registration(): void
    {
        register_taxonomy('genre', 'post', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_taxonomies', static fn(array $taxonomies): array => $taxonomies + ['genre' => []]);
        Settings::invalidateCache();

        $form = new TermCustomFieldsForm();
        $form->register();

        $this->assertFalse(has_action('genre_add_form_fields'), 'Registration alone must not read the managed set.');

        $form->registerTaxonomyFields();

        $this->assertNotFalse(has_action('genre_add_form_fields'));
        $this->assertNotFalse(has_action('genre_edit_form_fields'));
        $this->assertNotFalse(has_action('created_genre'));
        $this->assertNotFalse(has_action('edited_genre'));
    }
}
