<?php

defined('ABSPATH') || exit;

if (\Kizlo\Pos\Support\Permissions::access() !== true) return;

\Kizlo\Pos\Support\Asset::enqueue();
?>
<!doctype html>
<html <?php language_attributes(); ?> class="kizlo-pos-document">
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="robots" content="noindex,nofollow">
    <title><?php echo esc_html(get_bloginfo('name') . ' — Kizlo POS'); ?></title>
    <?php // Print only POS and its WordPress dependencies; theme hooks would reintroduce storefront styling.
    wp_print_styles(['kizlo-pos']); ?>
</head>
<body class="kizlo-pos-page">
    <div id="kizlo-pos-root"><p role="status">Opening Kizlo POS…</p></div>
    <noscript>Kizlo POS needs JavaScript enabled in your browser.</noscript>
    <?php wp_print_scripts(['kizlo-pos']); ?>
</body>
</html>
