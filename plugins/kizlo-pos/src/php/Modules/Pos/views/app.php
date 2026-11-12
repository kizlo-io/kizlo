<?php

defined('ABSPATH') || exit;

if (\Kizlo\Pos\Support\Permissions::access() !== true) return;

\Kizlo\Pos\Support\Asset::enqueue();
?>
<!doctype html>
<html <?php language_attributes(); ?> class="kizlo-pos-document m-0 min-h-full overscroll-none bg-canvas p-0 scheme-light data-[pos-theme=dark]:scheme-dark">
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#f8f8f8">
    <meta name="robots" content="noindex,nofollow">
    <title><?php echo esc_html(get_bloginfo('name') . ' — Kizlo POS'); ?></title>
    <?php // Print only POS and its WordPress dependencies; theme hooks would reintroduce storefront styling.
    wp_print_styles(['kizlo-pos']); ?>
</head>
<body class="kizlo-pos-page m-0 min-h-dvh overscroll-none bg-canvas p-0">
    <div id="kizlo-pos-root" class="min-h-dvh">
        <div role="status" aria-label="Loading Kizlo POS" class="grid min-h-dvh place-items-center text-muted-foreground">
            <span aria-hidden="true" class="size-8 animate-spin rounded-full border-3 border-current border-t-transparent motion-reduce:animate-none"></span>
        </div>
    </div>
    <noscript>Kizlo POS needs JavaScript enabled in your browser.</noscript>
    <?php wp_print_scripts(['kizlo-pos']); ?>
</body>
</html>
