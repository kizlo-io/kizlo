<?php

namespace Kizlo\Tests\Seo;

use Kizlo\Modules\Seo\TermSeoMetaBox;
use Kizlo\Modules\Settings\Settings;

/**
 * When the term editor's SEO fields are attached.
 *
 * The fields are added once per managed taxonomy, so the class has to know the
 * managed set. It is only complete after `Registrar::registerObjects()` on `init`:
 * attaching during boot left the editor for every taxonomy an extension plugin
 * contributes without any SEO fields at all.
 */
class TermSeoMetaBoxTest extends SeoTestCase
{
    public function test_editor_fields_are_attached_on_init_rather_than_at_registration(): void
    {
        register_taxonomy('genre', 'post', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_taxonomies', static fn(array $taxonomies): array => $taxonomies + ['genre' => []]);

        // A fresh request's settings state, so the managed set is there to be read.
        Settings::invalidateCache();

        $metabox = new TermSeoMetaBox();
        $metabox->register();

        $this->assertFalse(has_action('genre_edit_form_fields'), 'Registration alone must not read the managed set.');

        $metabox->registerTaxonomyFields();

        $this->assertNotFalse(has_action('genre_edit_form_fields'));
        $this->assertNotFalse(has_action('edited_genre'));
    }
}
