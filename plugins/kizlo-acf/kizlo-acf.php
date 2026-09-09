<?php

/**
 * Plugin Name: Kizlo ACF
 * Plugin URI: https://kizlo.io/plugins/kizlo-acf
 * Description: Publishes Advanced Custom Fields values under kizlo.custom.acf.
 * Version: 0.1.0
 * Author: Kizlo Developers
 * Author URI: https://kizlo.io
 * License: GPL v2 or later
 * Text Domain: kizlo-acf
 * Domain Path: /languages
 * Requires at least: 6.5
 * Tested up to: 6.7
 * Requires PHP: 8.2
 * Requires Plugins: kizlo, advanced-custom-fields
 * Kizlo Requires: kizlo 0.16.0
 */

defined('ABSPATH') || exit;

define('KIZLO_ACF_VERSION', '0.1.0');
define('KIZLO_ACF_FILE', __FILE__);
define('KIZLO_ACF_PATH', plugin_dir_path(__FILE__));
define('KIZLO_ACF_URL', plugin_dir_url(__FILE__));
define('KIZLO_ACF_BASENAME', plugin_basename(__FILE__));

require_once KIZLO_ACF_PATH . 'vendor/autoload.php';

add_action('kizlo_loaded', function (): void {
    if (!function_exists('kizlo_extension')) {
        add_action('admin_notices', function (): void {
            if (!current_user_can('activate_plugins')) return;

            printf(
                '<div class="notice notice-error"><p><strong>%s</strong> %s</p></div>',
                esc_html('Kizlo ACF'),
                esc_html('did not start. It needs Kizlo 0.16.0 or newer.')
            );
        });

        return;
    }

    kizlo_extension(KIZLO_ACF_FILE, function (): void {
        Kizlo\Acf\Plugin::instance()->boot();
    });
});
