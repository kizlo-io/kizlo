<?php

/**
 * Kizlo Headless renders no public front end.
 *
 * The frontend is served by a separate headless app, so this template outputs no
 * markup by design. Headless Mode's frontend lockout normally 404s these requests
 * before the theme loads; this empty template is the backstop when it is off.
 *
 * The exception is a request an extension claims through the neutral
 * `kizlo_headless_render_frontend` filter (WooCommerce claims the order-pay page,
 * for example): that surface is genuinely WordPress-rendered, so emit a minimal
 * document — wp_head(), the loop with the_content(), and wp_footer() — so the page
 * body and the assets those hooks enqueue are output.
 */

defined('ABSPATH') || exit;

if (! apply_filters('kizlo_headless_render_frontend', false)) {
    return;
}

?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php
while (have_posts()) {
    the_post();
    the_content();
}
wp_footer();
?>
</body>
</html>
