<?php defined('ABSPATH') || exit; ?>
<dialog id="kizlo-regeneration-dialog" aria-labelledby="kizlo-regeneration-title" aria-describedby="kizlo-regeneration-warning">
    <form id="kizlo-regeneration-form">
        <h2 id="kizlo-regeneration-title"><?php esc_html_e('Regenerate barcodes?', 'kizlo-woocommerce'); ?></h2>
        <p id="kizlo-regeneration-warning"><?php esc_html_e('Regenerating replaces existing barcodes. Previously printed labels will stop working and must be replaced.', 'kizlo-woocommerce'); ?></p>
        <div class="kizlo-regeneration-actions">
            <button type="button" class="button" id="kizlo-cancel-regeneration" autofocus><?php esc_html_e('Cancel', 'kizlo-woocommerce'); ?></button>
            <button type="submit" class="button button-primary kizlo-regenerate-confirm"><?php esc_html_e('Regenerate barcodes', 'kizlo-woocommerce'); ?></button>
        </div>
    </form>
</dialog>
