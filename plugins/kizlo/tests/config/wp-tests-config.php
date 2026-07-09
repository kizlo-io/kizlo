<?php

/**
 * Config for the WordPress PHP test suite (wp-phpunit).
 *
 * This is read inside the `wordpress` container, where the served WordPress core
 * lives at `/var/www/html`. It points the test suite at an isolated `wordpress_test`
 * database (created + granted to the `wordpress` user by the CLI provisioning step)
 * so the phpunit run never touches the seeded site vitest talks to. Every value
 * falls back to the CLI's defaults but can be overridden by the env the runner sets.
 */

define('ABSPATH', getenv('WP_TESTS_ABSPATH') ?: '/var/www/html/');
define('WP_DEFAULT_THEME', 'default');

define('DB_NAME', getenv('WP_TESTS_DB_NAME') ?: 'wordpress_test');
define('DB_USER', getenv('WP_TESTS_DB_USER') ?: 'wordpress');
define('DB_PASSWORD', getenv('WP_TESTS_DB_PASSWORD') ?: 'wppass');
define('DB_HOST', getenv('WP_TESTS_DB_HOST') ?: 'mysql:3306');
define('DB_CHARSET', 'utf8');
define('DB_COLLATE', '');

// Distinct from the served site's default `wp_` prefix — the suite drops and
// recreates every table with this prefix on each run.
$table_prefix = 'wptests_';

define('WP_TESTS_DOMAIN', 'example.org');
define('WP_TESTS_EMAIL', 'admin@example.org');
define('WP_TESTS_TITLE', 'Kizlo Test Suite');
define('WP_PHP_BINARY', 'php');
define('WPLANG', '');