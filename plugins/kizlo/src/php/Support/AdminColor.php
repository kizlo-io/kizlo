<?php

namespace Kizlo\Support;

/**
 * Bridges the active wp-admin colour scheme into CSS variables the React UI can
 * theme against, so the plugin picks up whatever accent the user chose under
 * Users -> Profile without hard-coding a palette.
 */
class AdminColor
{
    private const FALLBACK_ACCENT = '#2271b1';
    private const FALLBACK_MENU_BG = '#1d2327';

    /**
     * Build a `:root { ... }` declaration exposing the current scheme's accent,
     * a darkened hover variant, and the admin menu background. Feed the result
     * to wp_add_inline_style() on a handle that loads before the React roots.
     */
    public static function inlineVars(): string
    {
        $scheme = get_user_option('admin_color') ?: 'fresh';
        $palette = $GLOBALS['_wp_admin_css_colors'][$scheme] ?? null;
        $colors = is_object($palette) && ! empty($palette->colors) ? $palette->colors : [];

        $accent = $colors[2] ?? (end($colors) ?: self::FALLBACK_ACCENT);
        $menuBg = $colors[0] ?? self::FALLBACK_MENU_BG;

        return sprintf(
            ':root{--kizlo-accent:%1$s;--kizlo-accent-hover:color-mix(in srgb, %1$s 80%%, black);--kizlo-admin-menu-bg:%2$s;}',
            $accent,
            $menuBg
        );
    }
}
