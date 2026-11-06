<?php

defined('ABSPATH') || exit;

/** @var array $items */
/** @var ?string $error */
/** @var int $generated */
/** @var int $skipped */
/** @var array<int, string> $failures */
/** @var array<string, string|float|int> $layout */
?>
<div class="wrap kizlo-barcode-labels">
    <h1><?php esc_html_e('Barcode labels', 'kizlo-woocommerce'); ?></h1>
    <?php if ($error !== null): ?>
        <div class="notice notice-error"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>
    <?php if ($generated > 0): ?>
        <div class="notice notice-success"><p><?php printf(esc_html(_n('Assigned %d barcode.', 'Assigned %d barcodes.', $generated, 'kizlo-woocommerce')), $generated); ?></p></div>
    <?php endif; ?>
    <?php if ($skipped > 0): ?>
        <div class="notice notice-info"><p><?php printf(esc_html__('Skipped %d existing barcodes; values were preserved.', 'kizlo-woocommerce'), $skipped); ?></p></div>
    <?php endif; ?>
    <?php if ($failures): ?>
        <div class="notice notice-error"><p><?php esc_html_e('Some items could not be assigned. See the row errors below.', 'kizlo-woocommerce'); ?></p></div>
    <?php endif; ?>
    <?php if (!$items): ?>
        <p><?php esc_html_e('Select products from the Products list, then choose Print barcode labels from Bulk actions. Variable products expand into their variations.', 'kizlo-woocommerce'); ?></p>
        <a class="button" href="<?php echo esc_url(admin_url('edit.php?post_type=product')); ?>"><?php esc_html_e('Choose products', 'kizlo-woocommerce'); ?></a>
    <?php else: ?>
        <p><?php esc_html_e('Choose label quantities, preview the layout, then print. Printing labels does not change stock.', 'kizlo-woocommerce'); ?></p>
        <?php if (array_filter($items, static fn(array $item): bool => $item['code'] === null)): ?>
            <form method="post">
                <?php wp_nonce_field('kizlo_generate_barcodes'); ?>
                <p>
                    <button class="button" name="kizlo_generate_barcodes" value="1"><?php esc_html_e('Generate missing barcodes', 'kizlo-woocommerce'); ?></button>
                    <?php esc_html_e('Review the actual items below before generating. Assigns only missing barcodes, using each item’s saved type or the current store default.', 'kizlo-woocommerce'); ?>
                </p>
            </form>
        <?php endif; ?>
        <noscript><div class="notice notice-warning"><p><?php esc_html_e('Enable JavaScript to preview and print labels.', 'kizlo-woocommerce'); ?></p></div></noscript>
        <form id="kizlo-label-form">
            <table class="widefat striped">
                <thead><tr>
                    <th><?php esc_html_e('Product / variation', 'kizlo-woocommerce'); ?></th>
                    <th><?php esc_html_e('Barcode', 'kizlo-woocommerce'); ?></th>
                    <th><?php esc_html_e('Type', 'kizlo-woocommerce'); ?></th>
                    <th><?php esc_html_e('Labels', 'kizlo-woocommerce'); ?></th>
                </tr></thead>
                <tbody>
                    <?php foreach ($items as $item): ?>
                        <tr>
                            <td><a href="<?php echo esc_url(get_edit_post_link($item['id']) ?: ''); ?>"><?php echo esc_html($item['name']); ?></a> <small>#<?php echo esc_html((string) $item['id']); ?></small></td>
                            <td><?php echo esc_html($item['error'] ?? $item['code'] ?? __('Not assigned', 'kizlo-woocommerce')); ?></td>
                            <td><?php echo esc_html(\Kizlo\WooCommerce\Modules\Barcode\Barcode::TYPES[$item['type']] ?? __('Choose in editor', 'kizlo-woocommerce')); ?></td>
                            <td><input type="number" data-product-id="<?php echo esc_attr((string) $item['id']); ?>" aria-label="<?php echo esc_attr(sprintf(__('Labels for %s', 'kizlo-woocommerce'), $item['name'])); ?>" min="0" max="2000" step="1" value="<?php echo $item['image'] ? '1' : '0'; ?>" <?php disabled($item['image'] === null); ?> /></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <div class="kizlo-label-settings">
                <label><?php esc_html_e('Print format', 'kizlo-woocommerce'); ?>
                    <select id="kizlo-label-format">
                        <option value="a4" <?php selected($layout['format'], 'a4'); ?>><?php esc_html_e('A4 label sheet', 'kizlo-woocommerce'); ?></option>
                        <option value="thermal" <?php selected($layout['format'], 'thermal'); ?>><?php esc_html_e('Thermal labels', 'kizlo-woocommerce'); ?></option>
                    </select>
                </label>
                <?php
                $settings = \Kizlo\WooCommerce\Modules\Barcode\Settings::LAYOUT;
                foreach ($settings as $key => [$label, $default, $min, $max]):
                    $value = $layout[$key]; ?>
                    <label <?php if (!in_array($key, ['width', 'height'], true)) echo 'data-sheet-setting'; ?>>
                        <?php echo esc_html__($label, 'kizlo-woocommerce'); ?>
                        <input type="number" id="kizlo-label-<?php echo esc_attr($key); ?>" value="<?php echo esc_attr((string) $value); ?>" min="<?php echo esc_attr((string) $min); ?>" max="<?php echo esc_attr((string) $max); ?>" step="0.1" required />
                    </label>
                <?php endforeach; ?>
            </div>
            <p><?php esc_html_e('Match these dimensions to your label stock. In the print dialog use 100% / actual size, disable headers and footers, and select the matching paper size. Print one test page before a batch.', 'kizlo-woocommerce'); ?></p>
            <p>
                <button type="submit" class="button"><?php esc_html_e('Update preview', 'kizlo-woocommerce'); ?></button>
                <button type="button" class="button button-primary" id="kizlo-print-labels"><?php esc_html_e('Print labels', 'kizlo-woocommerce'); ?></button>
            </p>
            <p id="kizlo-label-status" role="status" aria-live="polite"></p>
        </form>
        <div id="kizlo-label-preview" aria-label="<?php esc_attr_e('Label preview', 'kizlo-woocommerce'); ?>"></div>
        <script type="application/json" id="kizlo-label-data"><?php echo wp_json_encode($items, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?></script>
    <?php endif; ?>
</div>
