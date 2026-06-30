<?php

/**
 * Plugin Name: Kizlo
 * Plugin URI: https://kizlo.io/plugins/kizlo
 * Description: A plugin that connects your WordPress with Kizlo toolkit, headlessly.
 * Version: 0.2.0
 * Author: Kizlo Developers
 * Author URI: https://kizlo.io
 * License: GPL v2 or later
 * Text Domain: kizlo
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.4
 * Requires PHP: 8.2
 */

defined('ABSPATH') || exit;

define('KIZLO_VERSION', '0.2.0');
define('KIZLO_FILE', __FILE__);
define('KIZLO_PATH', plugin_dir_path(__FILE__));
define('KIZLO_URL', plugin_dir_url(__FILE__));
define('KIZLO_BASENAME', plugin_basename(__FILE__));

require_once KIZLO_PATH . 'vendor/autoload.php';
require_once KIZLO_PATH . 'src/php/Support/constants.php';
require_once KIZLO_PATH . 'src/php/Support/functions.php';

Kizlo\Kernel\Plugin::instance()->boot();
