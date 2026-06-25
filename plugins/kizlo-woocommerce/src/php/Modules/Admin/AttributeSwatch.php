<?php

namespace Kizlo\WooCommerce\Modules\Admin;

use WP_Term;
use Kizlo\Modules\Admin\Components;

class AttributeSwatch
{
    public function register(): void
    {
        add_action('woocommerce_after_add_attribute_fields', [$this, 'renderAddAttributeField']);
        add_action('woocommerce_after_edit_attribute_fields', [$this, 'renderEditAttributeField']);
        add_action('woocommerce_attribute_added', [$this, 'saveAttributeSwatchType']);
        add_action('woocommerce_attribute_updated', [$this, 'saveAttributeSwatchType']);
        add_action('woocommerce_loaded', [$this, 'registerTermHooks']);
        add_action('admin_footer', [$this, 'renderMediaUploaderScript']);
    }

    public function renderAddAttributeField(): void
    { ?>
        <div class="form-field">
            <label><?php _e('Swatch Type'); ?></label>
            <select name="kizlo_swatch_type">
                <option value="text"><?php _e('Text'); ?></option>
                <option value="color"><?php _e('Color'); ?></option>
                <option value="image"><?php _e('Image'); ?></option>
            </select>
            <p class="description"><?php _e('How should this attribute be displayed in filters.'); ?></p>
        </div>
    <?php }

    public function renderEditAttributeField(): void
    {
        $attribute_id = absint($_GET['edit'] ?? 0);
        $swatch_type  = $attribute_id ? get_option("kizlo_swatch_type_{$attribute_id}", 'text') : 'text'; ?>
        <tr class="form-field">
            <th><label><?php _e('Swatch Type'); ?></label></th>
            <td>
                <select name="kizlo_swatch_type">
                    <option value="text" <?php selected($swatch_type, 'text');  ?>><?php _e('Text'); ?></option>
                    <option value="color" <?php selected($swatch_type, 'color'); ?>><?php _e('Color'); ?></option>
                    <option value="image" <?php selected($swatch_type, 'image'); ?>><?php _e('Image'); ?></option>
                </select>
            </td>
        </tr>
        <?php }

    public function saveAttributeSwatchType(int $attribute_id): void
    {
        if (isset($_POST['kizlo_swatch_type'])) {
            update_option(
                "kizlo_swatch_type_{$attribute_id}",
                sanitize_text_field($_POST['kizlo_swatch_type'])
            );
        }
    }

    public function registerTermHooks(): void
    {
        foreach (wc_get_attribute_taxonomies() as $attribute) {
            $swatch_type = get_option("kizlo_swatch_type_{$attribute->attribute_id}", 'text');

            if ($swatch_type === 'text') continue;

            $taxonomy = wc_attribute_taxonomy_name($attribute->attribute_name);

            add_action("{$taxonomy}_add_form_fields", function () use ($swatch_type) {
                $this->renderSwatchField($swatch_type, null);
            });

            add_action("{$taxonomy}_edit_form_fields", function ($term) use ($swatch_type) {
                $this->renderSwatchField($swatch_type, $term);
            });

            add_action("created_{$taxonomy}", [$this, 'saveSwatchTermMeta']);
            add_action("edited_{$taxonomy}", [$this, 'saveSwatchTermMeta']);
        }
    }

    private function renderSwatchField(string $swatch_type, ?WP_Term $term): void
    {
        $is_add_form = $term === null;

        if ($swatch_type === 'color') {
            $value = $term ? get_term_meta($term->term_id, 'kizlo_term_color', true) : '#ffffff'; ?>

            <?php if ($is_add_form): ?>
                <div class="form-field">
                    <label><?php _e('Color'); ?></label>
                    <input type="color" name="kizlo_term_color" value="<?php echo esc_attr($value ?: '#ffffff'); ?>" />
                </div>
            <?php else: ?>
                <tr class="form-field">
                    <th><label><?php _e('Color'); ?></label></th>
                    <td><input type="color" name="kizlo_term_color" value="<?php echo esc_attr($value ?: '#ffffff'); ?>" /></td>
                </tr>
            <?php endif;
        } elseif ($swatch_type === 'image') {
            $image_id    = $term ? get_term_meta($term->term_id, 'kizlo_term_image', true) : null;
            $wrapper     = $is_add_form ? 'div' : 'tr';
            $inner       = $is_add_form ? 'div' : 'td';
            $label       = $is_add_form ? '<label>Image</label>' : '<th><label>Image</label></th>'; ?>

            <<?php echo $wrapper; ?> class="form-field kizlo-swatch-image-wrap">
                <?php echo $label; ?>
                <<?php echo $inner; ?>>
                    <?php
                    Components::media([
                        'name' => 'kizlo_term_image',
                        'value' => $image_id
                    ]);
                    ?>
                </<?php echo $inner; ?>>
            </<?php echo $wrapper; ?>>
        <?php
        }
    }

    public function saveSwatchTermMeta(int $term_id): void
    {
        if (isset($_POST['kizlo_term_color'])) {
            update_term_meta($term_id, 'kizlo_term_color', sanitize_hex_color($_POST['kizlo_term_color']));
        }
        if (isset($_POST['kizlo_term_image'])) {
            update_term_meta($term_id, 'kizlo_term_image', absint($_POST['kizlo_term_image']));
        }
    }

    public function renderMediaUploaderScript(): void
    {
        $taxonomy = $_GET['taxonomy'] ?? '';
        if (empty($taxonomy) || strpos($taxonomy, 'pa_') !== 0) return; ?>
        <script>
            jQuery(function($) {
                $(document).on('click', '.kizlo-upload-image', function(e) {
                    e.preventDefault();
                    var wrap = $(this).closest('.kizlo-swatch-image-wrap');
                    var frame = wp.media({
                        title: 'Select Swatch Image',
                        multiple: false,
                        library: {
                            type: 'image'
                        }
                    });
                    frame.on('select', function() {
                        var attachment = frame.state().get('selection').first().toJSON();
                        wrap.find('.kizlo-term-image-id').val(attachment.id);
                        wrap.find('.kizlo-swatch-image-preview img').attr('src',
                            attachment.sizes?.thumbnail?.url ?? attachment.url);
                        wrap.find('.kizlo-remove-image').show();
                    });
                    frame.open();
                });

                $(document).on('click', '.kizlo-remove-image', function(e) {
                    e.preventDefault();
                    var wrap = $(this).closest('.kizlo-swatch-image-wrap');
                    var placeholder = <?php echo wp_json_encode(wc_placeholder_img_src('thumbnail')); ?>;
                    wrap.find('.kizlo-term-image-id').val('');
                    wrap.find('.kizlo-swatch-image-preview img').attr('src', placeholder);
                    $(this).hide();
                });
            });
        </script>
<?php }
}
