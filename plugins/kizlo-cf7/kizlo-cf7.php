<?php

/**
 * Plugin Name: Kizlo Contact Form 7
 * Plugin URI: https://kizlo.io/plugins/kizlo-cf7
 * Description: Bring your Contact Form 7 forms into any JavaScript runtime. Submit and validate forms from AI-built UIs without touching the CF7 page markup.
 * Version: 1.0.0-beta.2
 * Author: Kizlo Developers
 * Author URI: https://kizlo.io
 * License: GPL v2 or later
 * Text Domain: kizlo-cf7
 * Domain Path: /languages
 * Requires at least: 6.5
 * Tested up to: 6.4
 * Requires PHP: 8.2
 * Requires Plugins: kizlo, contact-form-7
 */

defined('ABSPATH') || exit;

define('KIZLO_CF7_VERSION', '1.0.0-beta.2');
define('KIZLO_CF7_FILE', __FILE__);
define('KIZLO_CF7_PATH', plugin_dir_path(__FILE__));
define('KIZLO_CF7_URL', plugin_dir_url(__FILE__));
define('KIZLO_CF7_BASENAME', plugin_basename(__FILE__));

require_once KIZLO_CF7_PATH . 'vendor/autoload.php';

add_action('kizlo_loaded', function (): void {
    Kizlo\Cf7\Plugin::instance()->boot();
});
