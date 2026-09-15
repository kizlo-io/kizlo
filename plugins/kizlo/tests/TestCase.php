<?php

namespace Kizlo\Tests;

use WP_UnitTestCase;

/**
 * Base test case for the kizlo plugin suite.
 *
 * Extends WordPress's `WP_UnitTestCase`, so every test runs inside a real WordPress
 * with its database transaction rolled back afterwards (no cross-test pollution).
 * kizlo-specific helpers (configure plugin settings, seed SEO meta, create seeded
 * posts/terms) land here as the suite grows, so tests extend this rather than
 * `WP_UnitTestCase` directly.
 *
 * `WP_UnitTestCase` is provided at runtime by the wp-phpunit bootstrap, so it is not
 * Composer-autoloadable — this class is only usable once `tests/bootstrap.php` has run.
 */
abstract class TestCase extends WP_UnitTestCase
{
    /** @var array<string, string> */
    private array $bootPostTypes = [];

    /** @var array<string, string> */
    private array $bootTaxonomies = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->bootPostTypes  = get_post_types();
        $this->bootTaxonomies = get_taxonomies();
    }

    /** Authenticate the next REST dispatch as an administrator Application Password. */
    protected function actingAsAdmin(): int
    {
        $admin = self::factory()->user->create(['role' => 'administrator']);
        wp_set_current_user($admin);
        $GLOBALS['wp_rest_application_password_uuid'] = 'test-application-password';

        return $admin;
    }

    /**
     * Authenticate the next REST dispatch as a cookie-and-nonce administrator —
     * a logged-in admin with no Application Password, the way the wp-admin UI
     * reaches a Kizlo route.
     */
    protected function actingAsCookieAdmin(): int
    {
        $admin = self::factory()->user->create(['role' => 'administrator']);
        wp_set_current_user($admin);
        unset($GLOBALS['wp_rest_application_password_uuid']);

        return $admin;
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['wp_rest_application_password_uuid']);

        $this->unregisterFixtures();

        parent::tearDown();
    }

    /**
     * Unregisters the post types and taxonomies this test registered.
     *
     * Registered objects live in `$wp_post_types` and `$wp_taxonomies`, which the
     * database rollback does not touch. `WP_UnitTestCase` resets them only when
     * `WP_RUN_CORE_TESTS` is defined, and a plugin suite never defines it: core's
     * reset unregisters everything and re-registers only the built-ins, which would
     * drop what a plugin registers at `init`. So a fixture left behind stays
     * registered for the rest of the process, and `Registrar` skips a key that
     * already exists, so a later test's definition never reaches WordPress at all.
     *
     * Removing only what appeared during the test keeps the boot-time set intact,
     * and taxonomies go first so none is left pointing at an object type that has
     * already gone.
     */
    private function unregisterFixtures(): void
    {
        foreach (array_diff_key(get_taxonomies(), $this->bootTaxonomies) as $taxonomy) {
            unregister_taxonomy($taxonomy);
        }

        foreach (array_diff_key(get_post_types(), $this->bootPostTypes) as $post_type) {
            unregister_post_type($post_type);
        }
    }
}
