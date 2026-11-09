<?php

namespace Kizlo\Pos\Support;

use Kizlo\Pos\Modules\Pos\PosPage;

final class Asset
{
    private const BASE = 'build/modules/pos/index';

    public static function available(): bool
    {
        return is_file(KIZLO_POS_PATH . self::BASE . '.asset.php') && is_file(KIZLO_POS_PATH . self::BASE . '.js');
    }

    /** @return array<string, mixed> */
    public static function bootstrap(): array
    {
        $user = wp_get_current_user();
        return [
            'version' => KIZLO_POS_VERSION,
            'urls' => [
                'pos' => PosPage::url(),
                'wordpress' => home_url('/'),
                'account' => get_edit_profile_url($user->ID),
                'login' => wp_login_url(PosPage::url()),
                'logout' => html_entity_decode(wp_logout_url(PosPage::url()), ENT_QUOTES, 'UTF-8'),
            ],
            'restRoot' => rest_url(),
            'nonce' => wp_create_nonce('wp_rest'),
            'user' => ['id' => $user->ID, 'name' => $user->display_name],
            'store' => ['name' => wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES), 'currency' => get_woocommerce_currency()],
            'navigation' => [
                ['id' => 'products', 'label' => 'Products'],
                ['id' => 'sell', 'label' => 'Sell'],
                ['id' => 'orders', 'label' => 'Orders'],
                ['id' => 'settings', 'label' => 'Settings'],
            ],
        ];
    }

    /** @param array<string, mixed> $data */
    public static function inlineData(array $data): string
    {
        return 'window.kizloPos = ' . wp_json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';';
    }

    public static function enqueue(): void
    {
        if (!PosPage::isRequest() || Permissions::access() !== true || !self::available()) return;

        $asset = require KIZLO_POS_PATH . self::BASE . '.asset.php';
        wp_enqueue_script('kizlo-pos', KIZLO_POS_URL . self::BASE . '.js', $asset['dependencies'], $asset['version'], true);
        if (is_file(KIZLO_POS_PATH . self::BASE . '.css')) {
            wp_enqueue_style('kizlo-pos', KIZLO_POS_URL . self::BASE . '.css', [], $asset['version']);
            wp_style_add_data('kizlo-pos', 'rtl', 'replace');
        }
        wp_add_inline_script('kizlo-pos', self::inlineData(self::bootstrap()), 'before');
    }
}
