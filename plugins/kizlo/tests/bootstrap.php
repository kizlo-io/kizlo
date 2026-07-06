<?php

/**
 * PHPUnit bootstrap for the kizlo plugin's own test suite.
 *
 * This framework is internal to kizlo — it is not published for consumers. The pieces
 * it wires together (the wp-phpunit test library, the isolated test DB, the WordPress
 * boot) come from the plugin's dev dependencies and are driven by `kizlo test`, which
 * exports `WP_PHPUNIT__DIR` (the wp-phpunit test library) before invoking phpunit.
 */

require_once dirname(__DIR__) . '/vendor/autoload.php';

$tests_dir = getenv('WP_PHPUNIT__DIR');
if (!$tests_dir) {
    fwrite(STDERR, "WP_PHPUNIT__DIR is not set — run the suite via `kizlo test`.\n");
    exit(1);
}

// The WP test bootstrap locates its config via this constant (not an env var).
if (!defined('WP_TESTS_CONFIG_FILE_PATH')) {
    define('WP_TESTS_CONFIG_FILE_PATH', __DIR__ . '/config/wp-tests-config.php');
}

// Gives us tests_add_filter() to hook the plugin into the boot sequence.
require_once $tests_dir . '/includes/functions.php';

tests_add_filter('muplugins_loaded', static function (): void {
    require dirname(__DIR__) . '/kizlo.php';
});

require $tests_dir . '/includes/bootstrap.php';