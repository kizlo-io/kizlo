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
            wp_enqueue_style('kizlo-styles', KIZLO_URL . 'build/shared/styles.css', [], (string) time());
        }

        if ($hook !== 'toplevel_page_' . KIZLO_SETTINGS_PAGE) return;

        wp_enqueue_media();
        wp_enqueue_style('wp-components');

        Asset::enqueue(
            handle: 'kizlo-settings',
            module: SettingsModule::class,
            data: $this->settings->getPluginData(),
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
            $this->menuIcon(),
            76
        );
    }

    private function menuIcon(): string
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 190 190" fill="none">'
            . '<path d="M0 0H50V150H0V0ZM50 50H100V100H50V50ZM100 0H150V50H100V0ZM100 100H150V150H100V100Z" fill="white"/>'
            . '</svg>';

        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }
}
