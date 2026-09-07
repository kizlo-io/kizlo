<?php

namespace Kizlo\Modules\Headless;

use Kizlo\Modules\Settings\Headless\HeadlessSettings;
use WP_Theme;

/**
 * Ships and manages the bundled "Kizlo Headless" theme.
 *
 * Registration is always on — even while Headless Mode is off — so a site already
 * running Kizlo Headless keeps resolving its stylesheet. Activation is driven by
 * the `theme` toggle through {@see reconcile()}, and {@see onDeactivate()} makes
 * sure deactivating the plugin never strands the site on a theme whose directory
 * is about to stop being registered.
 */
class HeadlessTheme
{
    public const STYLESHEET = 'kizlo-headless';

    /**
     * Register the bundled theme directory unconditionally. This is not gated on
     * the Headless master switch: the theme has to stay discoverable whenever it
     * is the active stylesheet, or WordPress would fall back to a broken theme.
     */
    public function register(): void
    {
        register_theme_directory(KIZLO_PATH . 'theme');
    }

    /**
     * Bring the active theme in line with the `theme` toggle: switch to Kizlo
     * Headless when it is on, and away to a fallback when it is off and Kizlo
     * Headless is currently active. Idempotent — a site that already matches is
     * left untouched.
     */
    public static function reconcile(bool $desired): void
    {
        $active = get_stylesheet();

        if ($desired) {
            if ($active !== self::STYLESHEET) {
                switch_theme(self::STYLESHEET);
            }

            return;
        }

        if ($active === self::STYLESHEET) {
            self::switchToFallback();
        }
    }

    /**
     * Re-apply the stored `theme` preference when the plugin is activated. The
     * deactivation hook switches the site off Kizlo Headless, so without this a
     * deactivate/reactivate cycle would silently leave the site on the fallback
     * even though the preference is still on. A no-op on a fresh install, where
     * the toggle defaults off.
     */
    public static function onActivate(): void
    {
        self::reconcile(HeadlessSettings::load()->isEnabled('theme'));
    }

    /**
     * Switch off Kizlo Headless when the plugin is deactivated so the site is not
     * left on a theme whose directory is no longer registered.
     */
    public static function onDeactivate(): void
    {
        if (get_stylesheet() === self::STYLESHEET) {
            self::switchToFallback();
        }
    }

    /**
     * Move to a safe fallback: WordPress's bundled default theme when installed,
     * otherwise the first installed theme that is not Kizlo Headless.
     */
    private static function switchToFallback(): void
    {
        $default = WP_Theme::get_core_default_theme();

        if ($default instanceof WP_Theme) {
            switch_theme($default->get_stylesheet());

            return;
        }

        foreach (array_keys(wp_get_themes()) as $stylesheet) {
            if ($stylesheet !== self::STYLESHEET) {
                switch_theme($stylesheet);

                return;
            }
        }
    }
}
