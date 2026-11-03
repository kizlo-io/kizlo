<?php

/**
 * Plugin Name: Kizlo
 * Plugin URI: https://kizlo.io/plugins/kizlo
 * Description: A plugin that connects your WordPress with the Kizlo framework, headlessly.
 * Version: 0.20.0
 * Author: Kizlo Developers
 * Author URI: https://kizlo.io
 * License: GPL v2 or later
 * Text Domain: kizlo
 * Domain Path: /languages
 * Requires at least: 6.9
 * Tested up to: 7.1
 * Requires PHP: 8.2
 */

defined('ABSPATH') || exit;

define('KIZLO_VERSION', '0.20.0');
define('KIZLO_FILE', __FILE__);
define('KIZLO_PATH', plugin_dir_path(__FILE__));
define('KIZLO_URL', plugin_dir_url(__FILE__));
define('KIZLO_BASENAME', plugin_basename(__FILE__));

if (version_compare(get_bloginfo('version'), '6.9', '<')) {
    add_action('admin_notices', static function (): void { echo '<div class="notice notice-error"><p>Kizlo requires WordPress 6.9 or newer.</p></div>'; });
    return;
}

require_once KIZLO_PATH . 'vendor/autoload.php';
register_deactivation_hook(KIZLO_FILE, [Kizlo\Modules\Webhook\WebhookModule::class, 'deactivate']);
require_once KIZLO_PATH . 'src/php/Support/constants.php';
require_once KIZLO_PATH . 'src/php/Support/functions.php';

register_activation_hook(KIZLO_FILE, [Kizlo\Modules\Headless\Onboarding::class, 'activate']);
register_activation_hook(KIZLO_FILE, [Kizlo\Modules\Headless\HeadlessTheme::class, 'onActivate']);
register_deactivation_hook(KIZLO_FILE, [Kizlo\Modules\Headless\HeadlessTheme::class, 'onDeactivate']);

Kizlo\Kernel\Plugin::instance()->boot();
