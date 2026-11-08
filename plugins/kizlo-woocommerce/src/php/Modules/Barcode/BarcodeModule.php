<?php

namespace Kizlo\WooCommerce\Modules\Barcode;

use WC_Product;
use WP_Post;

final class BarcodeModule
{
    public function register(): void
    {
        add_action('woocommerce_product_options_inventory_product_data', [$this, 'renderProduct']);
        add_action('woocommerce_product_after_variable_attributes', [$this, 'renderVariation'], 10, 3);
        add_action('woocommerce_admin_process_product_object', [$this, 'saveProduct']);
        add_action('woocommerce_admin_process_variation_object', [$this, 'saveVariation'], 10, 2);
        add_filter('woocommerce_duplicate_product_exclude_meta', static fn(array $keys): array => [...$keys, Barcode::LEGACY_KEY, Barcode::TYPE_KEY]);
        (new Settings())->register();
        (new LabelPage())->register();
    }

    public function renderProduct(): void
    {
        global $product_object;
        if ($product_object instanceof WC_Product && $product_object->is_type('simple')) $this->renderField($product_object, '');
    }

    public function renderVariation(int $loop, array $data, WP_Post $post): void
    {
        $product = wc_get_product($post->ID);
        if ($product) $this->renderField($product, 'form-row form-row-full');
    }

    private function renderField(WC_Product $product, string $wrapper): void
    {
        $id = $product->get_id();
        $type = Barcode::type($product) ?? (Barcode::value($product) === null ? Settings::defaultType() : '');
        printf('<input type="hidden" name="kizlo_barcode_original[%d]" value="%s"><input type="hidden" name="kizlo_barcode_nonce[%d]" value="%s">', $id, esc_attr(Barcode::value($product) ?? ''), $id, esc_attr(Barcode::editorNonce($product)));
        woocommerce_wp_select([
            'id' => 'kizlo_barcode_type_' . $id, 'name' => 'kizlo_barcode_type[' . $id . ']',
            'label' => __('Barcode type', 'kizlo-woocommerce'), 'value' => $type,
            'options' => ['' => __('Choose a compatible type', 'kizlo-woocommerce')] + Barcode::TYPES,
            'wrapper_class' => $wrapper,
        ]);
        if (Barcode::value($product) === null) {
            woocommerce_wp_checkbox([
                'id' => 'kizlo_generate_barcode_' . $id, 'name' => 'kizlo_generate_barcode[' . $id . ']',
                'label' => __('Generate barcode', 'kizlo-woocommerce'),
                'description' => __('Fill the existing GTIN / UPC / EAN / ISBN field when you save.', 'kizlo-woocommerce'),
                'wrapper_class' => $wrapper, 'value' => 'no',
            ]);
        }
        printf('<p class="%s"><a href="%s">%s</a>', esc_attr($wrapper ?: 'form-field'), esc_url(LabelPage::url([$id])), esc_html__('Print labels', 'kizlo-woocommerce'));
        if (Barcode::value($product) !== null) {
            printf(' &middot; <button type="button" class="button-link button-link-delete" data-kizlo-regenerate="%s">%s</button>', esc_attr((string) $id), esc_html__('Regenerate barcode', 'kizlo-woocommerce'));
        }
        echo '</p>';
    }

    public function saveProduct(WC_Product $product): void
    {
        $id = $product->get_id();
        $nonce = $_POST['kizlo_barcode_nonce'][$id] ?? null;
        $original = $_POST['kizlo_barcode_original'][$id] ?? null;
        if (!is_string($nonce) || !is_string($original) || !wp_verify_nonce(wp_unslash($nonce), 'kizlo_barcode_' . $id . ':' . wp_unslash($original)) || !current_user_can('edit_post', $id) || !Barcode::supports($product)) return;
        $type = $_POST['kizlo_barcode_type'][$id] ?? '';
        if (!is_string($type)) return;
        try {
            Barcode::lockUntilSaved($product);
        } catch (\RuntimeException $exception) {
            wp_die(esc_html($exception->getMessage()), '', ['response' => 409, 'back_link' => true]);
        }
        try {
            Barcode::checkEditorValue($product, wp_unslash($original));
            $type = wp_unslash($type);
            if (($_POST['kizlo_generate_barcode'][$id] ?? '') === 'yes') {
                Barcode::assign($product, $type);
            } elseif ($type !== '') {
                Barcode::saveType($product, $type);
            }
        } catch (\InvalidArgumentException | \RuntimeException | \WC_Data_Exception $exception) {
            \WC_Admin_Meta_Boxes::add_error(sprintf(__('Barcode for item #%d: %s', 'kizlo-woocommerce'), $id, $exception->getMessage()));
        }
    }

    public function saveVariation(WC_Product $product, int $loop): void
    {
        $this->saveProduct($product);
    }
}
