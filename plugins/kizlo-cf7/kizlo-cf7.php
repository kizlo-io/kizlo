<?php

/**
 * Plugin Name: Kizlo Contact Form 7
 * Plugin URI: https://kizlo.io/plugins/kizlo-cf7
 * Description: Connects Contact Form 7 with the @kizlo/cf7 integration.
 * Version: 0.2.1
 * Author: Kizlo Developers
 * Author URI: https://kizlo.io
 * License: GPL v2 or later
 * Text Domain: kizlo-cf7
 * Domain Path: /languages
 * Requires at least: 6.5
 * Tested up to: 6.7
 * Requires PHP: 8.2
 * Requires Plugins: kizlo, contact-form-7
 * Kizlo Requires: kizlo 0.12.0
 */

defined('ABSPATH') || exit;

define('KIZLO_CF7_VERSION', '0.2.1');
define('KIZLO_CF7_FILE', __FILE__);
define('KIZLO_CF7_PATH', plugin_dir_path(__FILE__));
define('KIZLO_CF7_URL', plugin_dir_url(__FILE__));
define('KIZLO_CF7_BASENAME', plugin_basename(__FILE__));

require_once KIZLO_CF7_PATH . 'vendor/autoload.php';

add_action('kizlo_loaded', function (): void {
    if (!function_exists('kizlo_extension')) {
        add_action('admin_notices', function (): void {
            if (!current_user_can('activate_plugins')) return;

            printf(
                '<div class="notice notice-error"><p><strong>%s</strong> %s</p></div>',
                esc_html('Kizlo Contact Form 7'),
                esc_html('did not start. It needs Kizlo 0.12.0 or newer.')
            );
        });

        return;
    }

    kizlo_extension(KIZLO_CF7_FILE, function (): void {
        Kizlo\Cf7\Plugin::instance()->boot();
    });
});
