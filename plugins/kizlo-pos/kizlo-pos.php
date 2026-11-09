<?php

/**
 * Plugin Name: Kizlo POS
 * Plugin URI: https://kizlo.io/plugins/kizlo-pos
 * Description: A full-screen, responsive workspace for your WooCommerce store.
 * Version: 0.1.0
 * Author: Kizlo Developers
 * Author URI: https://kizlo.io
 * License: GPL v2 or later
 * Text Domain: kizlo-pos
 * Requires at least: 6.5
 * Requires PHP: 8.2
 * Requires Plugins: kizlo, woocommerce
 * Kizlo Requires: kizlo 0.20.0, woocommerce 11.0.1
 */

defined('ABSPATH') || exit;

define('KIZLO_POS_VERSION', '0.1.0');
define('KIZLO_POS_FILE', __FILE__);
define('KIZLO_POS_PATH', plugin_dir_path(__FILE__));
define('KIZLO_POS_URL', plugin_dir_url(__FILE__));

require_once KIZLO_POS_PATH . 'vendor/autoload.php';

register_activation_hook(__FILE__, [Kizlo\Pos\Modules\Pos\PosPage::class, 'activate']);
register_deactivation_hook(__FILE__, [Kizlo\Pos\Modules\Pos\PosPage::class, 'deactivate']);

add_action('kizlo_loaded', [Kizlo\Pos\Plugin::class, 'load']);
add_action('plugins_loaded', static function (): void {
    if (!did_action('kizlo_loaded')) {
        add_action('admin_notices', [Kizlo\Pos\Plugin::class, 'dependencyNotice']);
    }
}, 30);
