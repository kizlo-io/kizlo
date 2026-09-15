<?php

namespace Kizlo\Tests;

/**
 * {@see TestCase}'s guard against fixtures escaping the test that registered them.
 *
 * Registered post types and taxonomies are process-global and outlive the database
 * rollback, so one left behind shadows every later definition of the same key.
 * That is how a passing test starts depending on the class that ran before it.
 */
class FixtureCleanupTest extends TestCase
{
    public function test_a_test_may_register_its_own_post_type_and_taxonomy(): void
    {
        register_post_type('kizlo_fixture', ['public' => true]);
        register_taxonomy('kizlo_fixture_tag', 'kizlo_fixture', ['public' => true]);

        $this->assertTrue(post_type_exists('kizlo_fixture'));
        $this->assertTrue(taxonomy_exists('kizlo_fixture_tag'));
    }

    /**
     * `@depends` rather than declaration order, so this states out loud that it only
     * means something after the registration above ran, and is skipped rather than
     * vacuously green when it did not.
     *
     * @depends test_a_test_may_register_its_own_post_type_and_taxonomy
     */
    public function test_a_fixture_does_not_outlive_the_test_that_registered_it(): void
    {
        $this->assertFalse(post_type_exists('kizlo_fixture'));
        $this->assertFalse(taxonomy_exists('kizlo_fixture_tag'));
    }

    public function test_the_content_registered_at_boot_is_left_alone(): void
    {
        // The guard removes what a test added and nothing else. Core's own reset
        // does the opposite (unregister everything, re-register the built-ins),
        // which is exactly why it is gated behind WP_RUN_CORE_TESTS and would take
        // the plugin's own types with it here.
        $this->assertTrue(post_type_exists('post'));
        $this->assertTrue(post_type_exists('page'));
        $this->assertTrue(post_type_exists('attachment'));
        $this->assertTrue(taxonomy_exists('category'));
        $this->assertTrue(taxonomy_exists('post_tag'));
    }
}
