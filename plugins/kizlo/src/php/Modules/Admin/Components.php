<?php

namespace Kizlo\Modules\Admin;

/**
 * Reusable input renderer for the Kizlo settings page.
 * All methods are static — call directly without instantiation.
 *
 * @example Components::text(['name' => 'my_option', 'label' => 'Site Name'])
 */
class Components
{
    // ====================================================
    // TEXT / URL / PASSWORD / DATETIME
    // ====================================================

    /**
     * Renders a standard text, url, password, or datetime-local input.
     *
     * @param array{
     *   name: string,
     *   value?: string,
     *   type?: 'text'|'url'|'password'|'datetime-local'|'email',
     *   placeholder?: string,
     *   description?: string,
     *   class?: string,
     *   readonly?: bool,
     *   required?: bool,
     * } $args
     */
    public static function textInput(array $args): void
    {
        $name        = $args['name'];
        $value       = $args['value'] ?? get_option($name, '');
        $type        = $args['type'] ?? 'text';
        $placeholder = $args['placeholder'] ?? '';
        $description = $args['description'] ?? '';
        $class       = $args['class'] ?? 'regular-text';
        $readonly    = !empty($args['readonly']) ? 'readonly' : '';
        $required    = !empty($args['required']) ? 'required' : '';
?>
        <input
            type="<?php echo esc_attr($type); ?>"
            name="<?php echo esc_attr($name); ?>"
            id="<?php echo esc_attr($name); ?>"
            value="<?php echo esc_attr($value); ?>"
            placeholder="<?php echo esc_attr($placeholder); ?>"
            class="<?php echo esc_attr($class); ?>"
            <?php echo $readonly; ?>
            <?php echo $required; ?> />
        <?php self::description($description); ?>
    <?php
    }

    // ====================================================
    // TEXTAREA
    // ====================================================

    /**
     * Renders a textarea input.
     *
     * @param array{
     *   name: string,
     *   value?: string,
     *   rows?: int,
     *   placeholder?: string,
     *   description?: string,
     *   class?: string,
     * } $args
     */
    public static function textarea(array $args): void
    {
        $name        = $args['name'];
        $value       = $args['value'] ?? get_option($name, '');
        $rows        = $args['rows'] ?? 4;
        $placeholder = $args['placeholder'] ?? '';
        $description = $args['description'] ?? '';
        $class       = $args['class'] ?? 'large-text';
    ?>
        <textarea
            name="<?php echo esc_attr($name); ?>"
            id="<?php echo esc_attr($name); ?>"
            rows="<?php echo esc_attr((string) $rows); ?>"
            placeholder="<?php echo esc_attr($placeholder); ?>"
            class="<?php echo esc_attr($class); ?>"><?php echo esc_textarea($value); ?></textarea>
        <?php self::description($description); ?>
    <?php
    }

    // ====================================================
    // CHECKBOX
    // ====================================================

    /**
     * Renders a single checkbox.
     *
     * @param array{
     *   name: string,
     *   value?: string,
     *   checked?: bool,
     *   label?: string,
     *   description?: string,
     * } $args
     */
    public static function checkbox(array $args): void
    {
        $name        = $args['name'];
        $value       = $args['value'] ?? '1';
        $checked     = $args['checked'] ?? (bool) get_option($name, false);
        $label       = $args['label'] ?? '';
        $description = $args['description'] ?? '';
    ?>
        <label>
            <input
                type="checkbox"
                name="<?php echo esc_attr($name); ?>"
                id="<?php echo esc_attr($name); ?>"
                value="<?php echo esc_attr($value); ?>"
                <?php checked($checked); ?> />
            <?php if ($label) : ?>
                <span><?php echo esc_html($label); ?></span>
            <?php endif; ?>
        </label>
        <?php self::description($description); ?>
    <?php
    }

    // ====================================================
    // CHECKBOX GROUP
    // ====================================================

    /**
     * Renders a group of checkboxes.
     *
     * @param array{
     *   name: string,
     *   options?: array<string, string>,  // value => label
     *   checked?: string[],
     *   description?: string,
     * } $args
     */
    public static function checkboxGroup(array $args): void
    {
        $name        = $args['name'];
        $options     = $args['options'] ?? [];
        $checked     = $args['checked'] ?? [];
        $description = $args['description'] ?? '';
    ?>
        <fieldset>
            <?php foreach ($options as $value => $label) : ?>
                <label style="display:block;margin-bottom:6px;">
                    <input
                        type="checkbox"
                        name="<?php echo esc_attr($name); ?>[]"
                        value="<?php echo esc_attr($value); ?>"
                        <?php checked(in_array($value, $checked, true)); ?> />
                    <?php echo esc_html($label); ?>
                </label>
            <?php endforeach; ?>
        </fieldset>
        <?php self::description($description); ?>
    <?php
    }

    // ====================================================
    // SELECT
    // ====================================================

    /**
     * Renders a select dropdown.
     *
     * @param array{
     *   name: string,
     *   options?: array<string, string>,  // value => label
     *   selected?: string,
     *   description?: string,
     *   class?: string,
     * } $args
     */
    public static function select(array $args): void
    {
        $name        = $args['name'];
        $options     = $args['options'] ?? [];
        $selected    = $args['selected'] ?? get_option($name, '');
        $description = $args['description'] ?? '';
        $class       = $args['class'] ?? 'regular-text';
    ?>
        <select
            name="<?php echo esc_attr($name); ?>"
            id="<?php echo esc_attr($name); ?>"
            class="<?php echo esc_attr($class); ?>">
            <?php foreach ($options as $value => $label) : ?>
                <option value="<?php echo esc_attr($value); ?>" <?php selected($selected, $value); ?>>
                    <?php echo esc_html($label); ?>
                </option>
            <?php endforeach; ?>
        </select>
        <?php self::description($description); ?>
    <?php
    }

    // ====================================================
    // MEDIA PICKER
    // ====================================================

    /**
     * Renders a WordPress media picker that stores the attachment ID.
     * Requires wp_enqueue_media() to be called on the page.
     *
     * @param array{
     *   name: string,
     *   value?: int,
     *   description?: string,
     *   preview_size?: string,
     * } $args
     */
    public static function media(array $args): void
    {
        $name         = $args['name'];
        $attach_id    = (int) ($args['value'] ?? get_option($name, 0));
        $description  = $args['description'] ?? '';
        $preview_size = $args['preview_size'] ?? 'thumbnail';
        $image_url    = $attach_id ? wp_get_attachment_image_url($attach_id, $preview_size) : '';
        $uid          = 'kizlo_media_' . md5($name);
    ?>
        <div class="kizlo-media-field" id="<?php echo esc_attr($uid); ?>" style="display:flex;align-items:flex-start;gap:12px;">
            <div class="kizlo-media-preview" style="width:80px;height:80px;border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#f9f9f9;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <?php if ($image_url) : ?>
                    <img src="<?php echo esc_url($image_url); ?>" style="width:100%;height:100%;object-fit:cover;" />
                <?php else : ?>
                    <span style="color:#999;font-size:11px;text-align:center;padding:4px;">No image</span>
                <?php endif; ?>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
                <input
                    type="hidden"
                    name="<?php echo esc_attr($name); ?>"
                    class="kizlo-media-id"
                    value="<?php echo esc_attr($attach_id ?: ''); ?>" />
                <button type="button" class="button kizlo-media-select">Select Image</button>
                <button type="button" class="button kizlo-media-remove" <?php echo $attach_id ? '' : 'style="display:none;"'; ?>>Remove</button>
                <?php self::description($description); ?>
            </div>
        </div>
        <script>
            (function() {
                const wrapper = document.getElementById('<?php echo esc_js($uid); ?>');
                const selectBtn = wrapper.querySelector('.kizlo-media-select');
                const removeBtn = wrapper.querySelector('.kizlo-media-remove');
                const idInput = wrapper.querySelector('.kizlo-media-id');
                const preview = wrapper.querySelector('.kizlo-media-preview');
                let frame;

                selectBtn.addEventListener('click', () => {
                    if (frame) {
                        frame.open();
                        return;
                    }
                    frame = wp.media({
                        title: 'Select Image',
                        button: {
                            text: 'Use this image'
                        },
                        multiple: false,
                        library: {
                            type: 'image'
                        },
                    });
                    frame.on('select', () => {
                        const att = frame.state().get('selection').first().toJSON();
                        idInput.value = att.id;
                        preview.innerHTML = `<img src="${att.sizes?.thumbnail?.url || att.url}" style="width:100%;height:100%;object-fit:cover;" />`;
                        removeBtn.style.display = '';
                    });
                    frame.open();
                });

                removeBtn.addEventListener('click', () => {
                    idInput.value = '';
                    preview.innerHTML = '<span style="color:#999;font-size:11px;text-align:center;padding:4px;">No image</span>';
                    removeBtn.style.display = 'none';
                });
            })();
        </script>
    <?php
    }

    // ====================================================
    // REPEATER
    // ====================================================

    /**
     * Renders a repeatable list of text/url inputs.
     *
     * @param array{
     *   name: string,
     *   values?: string[],
     *   type?: 'text'|'url',
     *   placeholder?: string,
     *   min_rows?: int,       // minimum rows always shown, can't be removed
     *   description?: string,
     *   add_label?: string,
     * } $args
     */
    public static function repeater(array $args): void
    {
        $name        = $args['name'];
        $values      = $args['values'] ?? (array) get_option($name, []);
        $type        = $args['type'] ?? 'text';
        $placeholder = $args['placeholder'] ?? '';
        $min_rows    = $args['min_rows'] ?? 1;
        $description = $args['description'] ?? '';
        $add_label   = $args['add_label'] ?? '+ Add';
        $uid         = 'kizlo_repeater_' . md5($name);

        if (empty($values)) $values = array_fill(0, $min_rows, '');
    ?>
        <div id="<?php echo esc_attr($uid); ?>">
            <?php foreach ($values as $index => $value) : ?>
                <div class="kizlo-repeater-row" style="display:flex;gap:8px;margin-bottom:8px;">
                    <input
                        type="<?php echo esc_attr($type); ?>"
                        name="<?php echo esc_attr($name); ?>[]"
                        value="<?php echo esc_attr($value); ?>"
                        placeholder="<?php echo esc_attr($placeholder); ?>"
                        class="regular-text" />
                    <?php if ($index >= $min_rows) : ?>
                        <button type="button" class="button kizlo-repeater-remove">Remove</button>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        </div>
        <button type="button" class="button kizlo-repeater-add" data-uid="<?php echo esc_attr($uid); ?>" data-name="<?php echo esc_attr($name); ?>" data-type="<?php echo esc_attr($type); ?>" data-placeholder="<?php echo esc_attr($placeholder); ?>">
            <?php echo esc_html($add_label); ?>
        </button>
        <?php self::description($description); ?>
        <script>
            (function() {
                const container = document.getElementById('<?php echo esc_js($uid); ?>');
                const addBtn = container.nextElementSibling;

                addBtn.addEventListener('click', () => {
                    const row = document.createElement('div');
                    row.className = 'kizlo-repeater-row';
                    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
                    row.innerHTML = `
                    <input type="${addBtn.dataset.type}" name="${addBtn.dataset.name}[]" placeholder="${addBtn.dataset.placeholder}" class="regular-text" />
                    <button type="button" class="button kizlo-repeater-remove">Remove</button>
                `;
                    container.appendChild(row);
                });

                container.addEventListener('click', (e) => {
                    if (e.target.classList.contains('kizlo-repeater-remove')) {
                        e.target.closest('.kizlo-repeater-row').remove();
                    }
                });
            })();
        </script>
    <?php
    }

    // ====================================================
    // KEY-VALUE REPEATER
    // ====================================================

    /**
     * Renders a repeatable list of key-value pairs.
     * Useful for social profiles, custom headers, etc.
     *
     * @param array{
     *   name: string,
     *   values?: array<string, string>,  // key => url/value
     *   fixed?: array<string, string>,   // key => label (these rows can't be removed)
     *   key_placeholder?: string,
     *   value_placeholder?: string,
     *   value_type?: 'text'|'url',
     *   description?: string,
     *   add_label?: string,
     * } $args
     */
    public static function keyValueRepeater(array $args): void
    {
        $name              = $args['name'];
        $values            = $args['values'] ?? (array) get_option($name, []);
        $fixed             = $args['fixed'] ?? [];
        $key_placeholder   = $args['key_placeholder'] ?? 'Name';
        $value_placeholder = $args['value_placeholder'] ?? 'Value';
        $value_type        = $args['value_type'] ?? 'text';
        $description       = $args['description'] ?? '';
        $add_label         = $args['add_label'] ?? '+ Add';
        $uid               = 'kizlo_kvr_' . md5($name);

        $extras = array_filter($values, fn($key) => !array_key_exists($key, $fixed), ARRAY_FILTER_USE_KEY);
    ?>
        <?php if ($fixed) : ?>
            <table class="widefat" style="max-width:560px;margin-bottom:12px;border-radius:4px;">
                <tbody>
                    <?php foreach ($fixed as $key => $label) : ?>
                        <tr>
                            <td style="width:140px;font-weight:500;"><?php echo esc_html($label); ?></td>
                            <td>
                                <input
                                    type="<?php echo esc_attr($value_type); ?>"
                                    name="<?php echo esc_attr($name); ?>[<?php echo esc_attr($key); ?>]"
                                    value="<?php echo esc_attr($values[$key] ?? ''); ?>"
                                    placeholder="<?php echo esc_attr($value_placeholder); ?>"
                                    class="regular-text" />
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>

        <div id="<?php echo esc_attr($uid); ?>">
            <?php foreach ($extras as $key => $value) : ?>
                <div class="kizlo-kvr-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
                    <input
                        type="text"
                        placeholder="<?php echo esc_attr($key_placeholder); ?>"
                        data-kizlo-key="true"
                        value="<?php echo esc_attr($key); ?>"
                        style="width:160px;" />
                    <input
                        type="<?php echo esc_attr($value_type); ?>"
                        placeholder="<?php echo esc_attr($value_placeholder); ?>"
                        name="<?php echo esc_attr($name); ?>[<?php echo esc_attr($key); ?>]"
                        value="<?php echo esc_attr($value); ?>"
                        class="regular-text kizlo-kvr-value" />
                    <button type="button" class="button kizlo-kvr-remove">Remove</button>
                </div>
            <?php endforeach; ?>
        </div>

        <button
            type="button"
            class="button kizlo-kvr-add"
            data-uid="<?php echo esc_attr($uid); ?>"
            data-name="<?php echo esc_attr($name); ?>"
            data-key-placeholder="<?php echo esc_attr($key_placeholder); ?>"
            data-value-placeholder="<?php echo esc_attr($value_placeholder); ?>"
            data-value-type="<?php echo esc_attr($value_type); ?>"
            style="margin-top:4px;">
            <?php echo esc_html($add_label); ?>
        </button>
        <?php self::description($description); ?>

        <script>
            (function() {
                const container = document.getElementById('<?php echo esc_js($uid); ?>');
                const addBtn = document.querySelector('[data-uid="<?php echo esc_js($uid); ?>"]');

                function bindKeySync(row) {
                    const keyInput = row.querySelector('[data-kizlo-key]');
                    const valueInput = row.querySelector('.kizlo-kvr-value');
                    keyInput.addEventListener('input', () => {
                        const key = keyInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
                        valueInput.name = `${addBtn.dataset.name}[${key}]`;
                    });
                }

                // Bind existing extra rows
                container.querySelectorAll('.kizlo-kvr-row').forEach(bindKeySync);

                addBtn.addEventListener('click', () => {
                    const row = document.createElement('div');
                    row.className = 'kizlo-kvr-row';
                    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
                    row.innerHTML = `
                <input type="text" placeholder="${addBtn.dataset.keyPlaceholder}" data-kizlo-key="true" style="width:160px;" />
                <input type="${addBtn.dataset.valueType}" placeholder="${addBtn.dataset.valuePlaceholder}" name="${addBtn.dataset.name}[_new]" class="regular-text kizlo-kvr-value" />
                <button type="button" class="button kizlo-kvr-remove">Remove</button>
            `;
                    container.appendChild(row);
                    bindKeySync(row);
                });

                container.addEventListener('click', (e) => {
                    if (e.target.classList.contains('kizlo-kvr-remove')) {
                        e.target.closest('.kizlo-kvr-row').remove();
                    }
                });
            })();
        </script>
    <?php
    }

    // ====================================================
// FIELD GROUP
// ====================================================

    /**
     * Renders a static table of labeled inputs.
     * Keys and labels are predefined — user fills in values only.
     * Useful for post type URLs, per-taxonomy settings, etc.
     *
     * @param array{
     *   name: string,
     *   fields?: array<string, string>,  // key => label
     *   values?: array<string, string>, // key => saved value
     *   type?: 'text'|'url'|'email',
     *   placeholder?: string,
     *   description?: string,
     * } $args
     */
    public static function fieldGroup(array $args): void
    {
        $name        = $args['name'];
        $fields      = $args['fields'] ?? [];
        $values      = $args['values'] ?? (array) get_option($name, []);
        $type        = $args['type'] ?? 'text';
        $placeholder = $args['placeholder'] ?? '';
        $description = $args['description'] ?? '';
    ?>
        <table class="widefat" style="max-width:560px;">
            <tbody>
                <?php foreach ($fields as $key => $label) : ?>
                    <tr>
                        <td style="width:160px;font-weight:500;"><?php echo esc_html($label); ?></td>
                        <td>
                            <input
                                type="<?php echo esc_attr($type); ?>"
                                name="<?php echo esc_attr($name); ?>[<?php echo esc_attr($key); ?>]"
                                value="<?php echo esc_attr($values[$key] ?? ''); ?>"
                                placeholder="<?php echo esc_attr($placeholder); ?>"
                                class="regular-text" />
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php self::description($description); ?>
<?php
    }

    // ====================================================
    // DESCRIPTION HELPER
    // ====================================================

    private static function description(string $text): void
    {
        if ($text) {
            echo '<p class="description">' . esc_html($text) . '</p>';
        }
    }
}
