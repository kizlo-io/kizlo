<?php

/**
 * Being classic (this file plus index.php, no block templates/) is what brings the
 * Appearance → Menus screen back on a site whose previous theme was a block theme.
 * Registering menu locations is what makes that screen usable for the menus Kizlo
 * serves over REST.
 */

defined('ABSPATH') || exit;

add_action('after_setup_theme', function (): void {
    register_nav_menus([
        'primary' => __('Primary', 'kizlo-headless'),
        'footer'  => __('Footer', 'kizlo-headless'),
    ]);

    add_theme_support('title-tag');
});
