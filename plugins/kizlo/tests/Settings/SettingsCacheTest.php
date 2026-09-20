<?php

namespace Kizlo\Tests\Settings;

use Kizlo\Modules\Registration\Registrar;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Modules\Settings\Settings;
use Kizlo\Modules\Settings\SettingsCache;
use Kizlo\Modules\Settings\Taxonomy\TaxonomySettings;
use Kizlo\Support\Utils;
use Kizlo\Tests\TestCase;

/**
 * What the shared settings transient is allowed to hold.
 *
 * Post type and taxonomy membership is assembled from filters an extension plugin
 * joins on `kizlo_loaded` and from objects WordPress registers on `init`, so a read
 * taken during core's own boot sees only part of it. The cache exists to be shared,
 * so a partial set must never reach it: one request's half-built view would answer
 * every other request until the transient expired.
 */
class SettingsCacheTest extends TestCase
{
    private const KEY = 'kizlo_settings_cache';

    protected function setUp(): void
    {
        parent::setUp();

        delete_transient(self::KEY);
    }

    protected function tearDown(): void
    {
        delete_transient(self::KEY);

        // Registration is process state the bootstrap already completed, so a test
        // that rewound it would leave every later one looking mid-boot.
        (new Registrar())->registerObjects();

        parent::tearDown();
    }

    /** A post type that only exists once an extension has contributed it. */
    private function contributeBook(): void
    {
        register_post_type('book', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_post_types', static fn(array $types): array => $types + ['book' => []]);
    }

    public function test_a_read_before_registration_completes_is_not_persisted(): void
    {
        Registrar::reset();

        Settings::cached();

        $this->assertFalse(get_transient(self::KEY));
    }

    public function test_a_read_after_registration_completes_is_persisted(): void
    {
        Settings::cached();

        $this->assertIsArray(get_transient(self::KEY));
    }

    public function test_a_post_type_contributed_after_boot_reaches_the_cache(): void
    {
        Registrar::reset();

        // The mid-boot read, before either the filter or the object exists.
        Settings::cached();

        $this->contributeBook();
        (new Registrar())->registerObjects();

        $this->assertArrayHasKey('book', Settings::cached()->postTypes->all());
        $this->assertArrayHasKey('book', get_transient(self::KEY)['post_types']);
    }

    public function test_custom_fields_configured_for_a_contributed_post_type_are_read_back(): void
    {
        Registrar::reset();

        Settings::cached();

        $this->contributeBook();

        $settings = PostTypeSettings::load('book');
        $settings->setData(['custom_fields' => [['type' => 'text', 'name' => 'blurb', 'label' => 'Blurb']]]);
        $settings->save('book');

        (new Registrar())->registerObjects();

        $names = array_column(Utils::getSettings()->postTypes->get('book')->getCustomFields(), 'name');

        $this->assertSame(['blurb'], $names);
    }

    public function test_plugin_activation_invalidates_and_rebuilds_contributed_settings(): void
    {
        $post_types = static fn(array $types): array => $types + ['book' => []];
        $taxonomies = static fn(array $items): array => $items + ['genre' => []];

        $post_type = PostTypeSettings::load('book');
        $post_type->setData(['custom_fields' => [['type' => 'text', 'name' => 'blurb', 'label' => 'Blurb']]]);
        $post_type->save('book');

        $taxonomy = TaxonomySettings::load('genre');
        $taxonomy->setData(['custom_fields' => [['type' => 'text', 'name' => 'mood', 'label' => 'Mood']]]);
        $taxonomy->save('genre');

        Settings::cached();
        $this->assertArrayNotHasKey('book', get_transient(self::KEY)['post_types']);
        $this->assertArrayNotHasKey('genre', get_transient(self::KEY)['taxonomies']);

        register_post_type('book', ['public' => true, 'show_in_rest' => true]);
        register_taxonomy('genre', 'book', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_post_types', $post_types);
        add_filter('kizlo_internal_taxonomies', $taxonomies);

        $this->assertSame(10, has_action('activated_plugin', [SettingsCache::class, 'invalidate']));

        do_action('activated_plugin', 'fixture/fixture.php', false);

        $this->assertFalse(get_transient(self::KEY));

        $settings = Settings::cached();

        $this->assertSame(['blurb'], array_column($settings->postTypes->get('book')->getCustomFields(), 'name'));
        $this->assertSame(['mood'], array_column($settings->taxonomies->get('genre')->getCustomFields(), 'name'));
    }

    public function test_plugin_deactivation_invalidates_and_removes_contributed_objects(): void
    {
        $post_types = static fn(array $types): array => $types + ['book' => []];
        $taxonomies = static fn(array $items): array => $items + ['genre' => []];

        register_post_type('book', ['public' => true, 'show_in_rest' => true]);
        register_taxonomy('genre', 'book', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_post_types', $post_types);
        add_filter('kizlo_internal_taxonomies', $taxonomies);

        $cached = Settings::cached();
        $this->assertArrayHasKey('book', $cached->postTypes->all());
        $this->assertArrayHasKey('genre', $cached->taxonomies->all());

        remove_filter('kizlo_internal_post_types', $post_types);
        remove_filter('kizlo_internal_taxonomies', $taxonomies);
        unregister_taxonomy('genre');
        unregister_post_type('book');

        $this->assertSame(10, has_action('deactivated_plugin', [SettingsCache::class, 'invalidate']));

        do_action('deactivated_plugin', 'fixture/fixture.php', true);

        $this->assertFalse(get_transient(self::KEY));

        $settings = Settings::cached();

        $this->assertArrayNotHasKey('book', $settings->postTypes->all());
        $this->assertArrayNotHasKey('genre', $settings->taxonomies->all());
    }

    public function test_the_internal_post_types_filter_is_not_memoized(): void
    {
        PostTypeSettings::getAvailableObjects();

        $this->contributeBook();

        $this->assertArrayHasKey('book', PostTypeSettings::getAvailableObjects());
    }

    public function test_the_internal_taxonomies_filter_is_not_memoized(): void
    {
        TaxonomySettings::getAvailableObjects();

        register_taxonomy('genre', 'post', ['public' => true, 'show_in_rest' => true]);
        add_filter('kizlo_internal_taxonomies', static fn(array $taxonomies): array => $taxonomies + ['genre' => []]);

        $this->assertArrayHasKey('genre', TaxonomySettings::getAvailableObjects());
    }
}
