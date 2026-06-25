<?php

namespace Kizlo\Modules\Admin;

use Kizlo\Modules\Settings\SettingsModule;
use Kizlo\Support\Asset;

class PluginSettingsPage
{
    const OPTION_SITE        = 'kizlo_settings_site';
    const OPTION_IDENTITY    = 'kizlo_settings_identity';
    const OPTION_AUTHORS     = 'kizlo_settings_authors';
    const OPTION_POST_TYPES  = 'kizlo_settings_post_types';
    const OPTION_TAXONOMIES  = 'kizlo_settings_taxonomies';
    const OPTION_SECURITY    = 'kizlo_settings_security';
    const OPTION_INTEGRATION = 'kizlo_settings_integration';

    public function __construct(private SettingsModule $settings) {}

    public function register(): void
    {
        add_action('admin_menu', [$this, 'registerMenu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueueScripts']);
        // $this->registerRestRoutes();
    }

    public function enqueueScripts(string $hook): void
    {
        if (str_contains($hook, 'kizlo')) {
            wp_enqueue_style('kizlo-globals', KIZLO_URL . 'build/shared/globals.css', [], (string) time());

            // Expose admin menu background as a CSS variable
            $bg = $GLOBALS['_wp_admin_css_colors'][get_user_option('admin_color') ?: 'fresh']->colors[0] ?? '#1d2327';
            wp_add_inline_style('kizlo-globals', ":root{--kizlo-admin-menu-bg:{$bg};}");
        }

        if ($hook !== 'toplevel_page_' . KIZLO_SETTINGS_PAGE) return;

        wp_enqueue_media();
        wp_enqueue_style('wp-components');

        Asset::enqueue(
            handle: 'kizlo-settings',
            module: SettingsModule::class,
            data:   $this->settings->getPluginData(),
        );
    }

    public function renderSettingsRoot(): void
    {
        echo '<div id="kizlo-root"></div>';
    }

    public function registerMenu(): void
    {
        add_menu_page(
            'Kizlo',
            'Kizlo',
            'manage_options',
            KIZLO_SETTINGS_PAGE,
            [$this, 'renderSettingsRoot'],
            'dashicons-superhero',
            56
        );

        add_submenu_page(
            KIZLO_SETTINGS_PAGE,
            'Settings',
            'Settings',
            'manage_options',
            'kizlo-settings',
            [$this, 'renderSettingsRoot']
        );
    }
}
