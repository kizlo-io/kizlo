<?php

namespace Kizlo\Pos;

use Kizlo\Pos\Modules\Pos\PosPage;

final class Plugin
{
    public static function load(): void
    {
        if (!function_exists('kizlo_extension')) {
            add_action('admin_notices', [self::class, 'dependencyNotice']);
            return;
        }

        kizlo_extension(KIZLO_POS_FILE, static function (): void {
            (new PosPage())->register();
            (new \Kizlo\Pos\Modules\Product\ProductModule())->register();
            (new \Kizlo\Pos\Modules\Settings\Settings())->register();
        });
    }

    public static function dependencyNotice(): void
    {
        if (!current_user_can('activate_plugins')) return;

        echo '<div class="notice notice-error"><p>' . esc_html(
            'Kizlo POS did not start. Install and activate Kizlo 0.20.0 or newer and WooCommerce 11.0.1 or newer.'
        ) . '</p></div>';
    }
}
