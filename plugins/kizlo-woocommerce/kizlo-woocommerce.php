<?php

/**
 * Plugin Name: Kizlo WooCommerce
 * Plugin URI: https://github.com/kizlo-io/kizlo-wordpress/tree/main/plugins/kizlo-woocommerce
 * Description: Bring your WooCommerce store into any JavaScript runtime. Build storefronts, product pages, and checkout flows with modern tools and AI coding assistants.
 * Version: 1.0.0-beta.2
 * Author: Kizlo Developers
 * Author URI: https://kizlo.io
 * License: GPL v2 or later
 * Text Domain: kizlo-woocommerce
 * Domain Path: /languages
 * Requires at least: 6.5
 * Tested up to: 6.4
 * Requires PHP: 8.2
 * Requires Plugins: kizlo, woocommerce
 */

defined('ABSPATH') || exit;

define('KIZLO_WOOCOMMERCE_VERSION', '1.0.0-beta.2');
define('KIZLO_WOOCOMMERCE_FILE', __FILE__);
define('KIZLO_WOOCOMMERCE_PATH', plugin_dir_path(__FILE__));
define('KIZLO_WOOCOMMERCE_URL', plugin_dir_url(__FILE__));
define('KIZLO_WOOCOMMERCE_BASENAME', plugin_basename(__FILE__));

require_once KIZLO_WOOCOMMERCE_PATH . 'vendor/autoload.php';

add_action('kizlo_loaded', function (): void {
    Kizlo\WooCommerce\Plugin::instance()->boot();
});
