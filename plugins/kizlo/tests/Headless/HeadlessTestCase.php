<?php

namespace Kizlo\Tests\Headless;

use Kizlo\Tests\TestCase;
use Kizlo\Modules\Settings\Settings;
use Kizlo\Modules\Headless\HeadlessModule;

/**
 * Base case for the Headless behaviour suite.
 *
 * Each test seeds the headless + site options a real boot would read, invalidates
 * the settings cache, and registers a fresh module so its hooks reflect that state.
 * `WP_UnitTestCase` snapshots and restores the global hook registry per test, so
 * registering behaviours here never leaks into other tests.
 */
abstract class HeadlessTestCase extends TestCase
{
    protected const BASE_URL = 'https://example.com';

    /**
     * @param array<string, bool> $headless Headless toggles (merged over defaults).
     * @param array<string, mixed> $site     Site-settings overrides.
     */
    protected function seedHeadless(array $headless, array $site = []): void
    {
        update_option('kizlo_settings_site', array_merge(['url' => self::BASE_URL], $site));
        update_option('kizlo_settings_headless', $headless);
        // The test site uses plain permalinks, so pin a pathname structure to make
        // resolved post URLs deterministic (mirrors the SEO suite).
        update_option('kizlo_settings_post_types', ['post' => ['pathname_structure' => '/{{slug}}']]);
        Settings::invalidateCache();
    }

    /**
     * @param array<string, bool> $headless
     * @param array<string, mixed> $site
     */
    protected function bootHeadless(array $headless, array $site = []): HeadlessModule
    {
        $this->seedHeadless($headless, $site);

        $module = new HeadlessModule();
        $module->register();

        return $module;
    }
}
