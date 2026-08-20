<?php

/**
 * Config for the WooCommerce plugin's isolated WordPress test database.
 */

define('ABSPATH', getenv('WP_TESTS_ABSPATH') ?: '/var/www/html/');
define('WP_DEFAULT_THEME', 'default');

define('DB_NAME', getenv('WP_TESTS_DB_NAME') ?: 'wordpress_test');
define('DB_USER', getenv('WP_TESTS_DB_USER') ?: 'wordpress');
define('DB_PASSWORD', getenv('WP_TESTS_DB_PASSWORD') ?: 'wppass');
define('DB_HOST', getenv('WP_TESTS_DB_HOST') ?: 'mysql:3306');
define('DB_CHARSET', 'utf8');
define('DB_COLLATE', '');

$table_prefix = 'wc_tests_';

define('WP_TESTS_DOMAIN', 'example.org');
define('WP_TESTS_EMAIL', 'admin@example.org');
define('WP_TESTS_TITLE', 'Kizlo WooCommerce Test Suite');
define('WP_PHP_BINARY', 'php');
define('WPLANG', '');
