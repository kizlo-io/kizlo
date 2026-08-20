<?php

/**
 * PHPUnit bootstrap for the Kizlo WooCommerce plugin.
 *
 * The suite runs through `kizlo test`, inside the WordPress container where the
 * local Kizlo plugins and WooCommerce fixture are mounted. WooCommerce must be
 * loaded before the extension, and the extension must subscribe to
 * `kizlo_loaded` before Kizlo core fires it.
 */

require_once dirname(__DIR__) . '/vendor/autoload.php';

$tests_dir = getenv('WP_PHPUNIT__DIR');
if (!$tests_dir) {
    fwrite(STDERR, "WP_PHPUNIT__DIR is not set. Run the suite via `kizlo test`.\n");
    exit(1);
}

if (!defined('WP_TESTS_CONFIG_FILE_PATH')) {
    define('WP_TESTS_CONFIG_FILE_PATH', __DIR__ . '/config/wp-tests-config.php');
}

require_once $tests_dir . '/includes/functions.php';

tests_add_filter('muplugins_loaded', static function (): void {
    $plugins_dir = dirname(__DIR__, 2);

    require $plugins_dir . '/woocommerce/woocommerce.php';
    require dirname(__DIR__) . '/kizlo-woocommerce.php';
    require $plugins_dir . '/kizlo/kizlo.php';
});

// wp-phpunit creates the WordPress tables before loading wp-settings.php. Add
// WooCommerce's tables after its classes load on plugins_loaded and before its
// init callbacks query them.
tests_add_filter('setup_theme', static function (): void {
    \WC_Install::create_tables();
});

require $tests_dir . '/includes/bootstrap.php';
