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
}