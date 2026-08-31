<?php

/**
 * Plugin Name: Kizlo WooCommerce
 * Plugin URI: https://kizlo.io/plugins/kizlo-woocommerce
 * Description: Connects WooCommerce with the @kizlo/woocommerce integration.
 * Version: 0.3.1
 * Author: Kizlo Developers
 * Author URI: https://kizlo.io
 * License: GPL v2 or later
 * Text Domain: kizlo-woocommerce
 * Domain Path: /languages
 * Requires at least: 6.5
 * Tested up to: 6.7
 * Requires PHP: 8.2
 * Requires Plugins: kizlo, woocommerce
 * Kizlo Requires: kizlo 0.12.0, woocommerce 11.0.1
 * WC tested up to: 11.0.1
 */

defined('ABSPATH') || exit;

define('KIZLO_WOOCOMMERCE_VERSION', '0.3.1');
define('KIZLO_WOOCOMMERCE_FILE', __FILE__);
define('KIZLO_WOOCOMMERCE_PATH', plugin_dir_path(__FILE__));
define('KIZLO_WOOCOMMERCE_URL', plugin_dir_url(__FILE__));
define('KIZLO_WOOCOMMERCE_BASENAME', plugin_basename(__FILE__));

require_once KIZLO_WOOCOMMERCE_PATH . 'vendor/autoload.php';

add_action('before_woocommerce_init', static function (): void {
    if (!class_exists(Automattic\WooCommerce\Utilities\FeaturesUtil::class)) return;

    Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
        'custom_order_tables',
        KIZLO_WOOCOMMERCE_FILE,
        true
    );
});

/**
 * Start through Kizlo's gate, so the `Kizlo Requires` header above decides whether
 * anything here runs. This plugin describes the WooCommerce contract with core
 * functions (`kizlo_register_route_spec()` and friends) that arrived in Kizlo
 * 0.12.0, and calling one of those against an older core is a fatal.
 *
 * The `function_exists` check is the one requirement the header cannot express:
 * a core old enough to lack the gate is too old to be asked to apply it. Falling
 * back to a notice here keeps the answer on screen instead of leaving the store
 * quietly missing its contract.
 */
add_action('kizlo_loaded', function (): void {
    if (!function_exists('kizlo_extension')) {
        add_action('admin_notices', function (): void {
            if (!current_user_can('activate_plugins')) return;

            printf(
                '<div class="notice notice-error"><p><strong>%s</strong> %s</p></div>',
                esc_html('Kizlo WooCommerce'),
                esc_html('did not start. It needs Kizlo 0.12.0 or newer.')
            );
        });

        return;
    }

    kizlo_extension(KIZLO_WOOCOMMERCE_FILE, function (): void {
        Kizlo\WooCommerce\Plugin::instance()->boot();
    });
});
