<?php

namespace Kizlo\Pos\Modules\Settings;

final class Settings
{
    public const TEMPLATE_OPTION = 'kizlo_pos_share_template';
    public const DEFAULT_TEMPLATE = "{{name}}\n{{price}}\n\n{{description}}";
    public const TAGS = ['name', 'price', 'sku', 'description', 'stock', 'store_name', 'url'];

    public static function checkoutFields(): array
    {
        $fields = [];
        foreach (['first_name', 'last_name', 'email', 'phone', 'billing', 'shipping'] as $key) {
            $fields[$key] = get_option('kizlo_pos_collect_' . $key, 'no') === 'yes';
        }
        return $fields;
    }

    public static function handoff(): array
    {
        return ['device' => get_option('kizlo_pos_pay_device', 'yes') === 'yes',
            'send' => get_option('kizlo_pos_pay_send', 'yes') === 'yes',
            'default' => get_option('kizlo_pos_pay_default', 'device') === 'send' ? 'send' : 'device'];
    }

    private function checkoutSettings(): array
    {
        $fields = [['type' => 'title', 'id' => 'kizlo_pos_checkout', 'title' => __('POS checkout', 'kizlo-pos'),
            'desc' => __('Enabled fields are shown and required at checkout. Without email or phone the order remains guest. Missing shipping uses the full store address for rates and taxes.', 'kizlo-pos')]];
        foreach (['first_name' => 'First name', 'last_name' => 'Last name', 'email' => 'Email', 'phone' => 'Phone', 'billing' => 'Billing address', 'shipping' => 'Shipping address'] as $key => $label) {
            $fields[] = ['type' => 'checkbox', 'id' => 'kizlo_pos_collect_' . $key, 'title' => $label, 'desc' => __('Collect and require at POS', 'kizlo-pos'), 'default' => 'no'];
        }
        foreach (['device' => 'Open payment on this device', 'send' => 'Send payment link'] as $key => $label) {
            $fields[] = ['type' => 'checkbox', 'id' => 'kizlo_pos_pay_' . $key, 'title' => $label, 'default' => 'yes'];
        }
        $fields[] = ['type' => 'select', 'id' => 'kizlo_pos_pay_default', 'title' => __('Default payment handoff', 'kizlo-pos'),
            'default' => 'device', 'options' => ['device' => 'This device', 'send' => 'Send link']];
        $fields[] = ['type' => 'sectionend', 'id' => 'kizlo_pos_checkout'];
        return $fields;
    }

    public function register(): void
    {
        add_filter('woocommerce_get_settings_pages', [$this, 'pages']);
        add_filter('woocommerce_get_sections_kizlo', static fn(array $sections): array => $sections + ['pos' => __('POS', 'kizlo-pos')]);
        add_filter('woocommerce_get_settings_kizlo', [$this, 'fields'], 10, 2);
        add_filter('woocommerce_admin_settings_sanitize_option', [$this, 'sanitize'], 10, 3);
    }

    public function pages(array $pages): array
    {
        foreach ($pages as $page) {
            if ($page->get_id() === 'kizlo') return $pages;
        }
        $pages[] = new SettingsPage();
        return $pages;
    }

    public static function url(): string
    {
        return admin_url('admin.php?page=wc-settings&tab=kizlo&section=pos');
    }

    public function fields(array $fields, string $section): array
    {
        if (!in_array($section, ['', 'pos'], true)) return $fields;
        return array_merge([
            ['type' => 'title', 'id' => 'kizlo_pos_sharing', 'title' => __('POS product sharing', 'kizlo-pos'),
                'desc' => __('Share one product image with a caption built from the template below. A public website is not required.', 'kizlo-pos')],
            ['type' => 'textarea', 'id' => self::TEMPLATE_OPTION, 'title' => __('Product share caption', 'kizlo-pos'),
                'default' => self::DEFAULT_TEMPLATE, 'css' => 'width:100%;max-width:650px;min-height:180px;',
                'desc' => __('Plain text only. Available tags: {{name}}, {{price}}, {{sku}}, {{description}}, {{stock}}, {{store_name}}, {{url}}. Values come from the selected product or variation. The URL tag is optional; unavailable values become empty text. Leave blank to restore the default. Refresh product details in POS after saving.', 'kizlo-pos')],
            ['type' => 'sectionend', 'id' => 'kizlo_pos_sharing'],
        ], $this->checkoutSettings());
    }

    public function sanitize(mixed $value, array $option, mixed $raw): mixed
    {
        if (($option['id'] ?? '') !== self::TEMPLATE_OPTION) return $value;
        $template = is_string($raw) ? sanitize_textarea_field($raw) : '';
        if (trim($template) === '') return self::DEFAULT_TEMPLATE;
        preg_match_all('/{{(.*?)}}/s', $template, $matches);
        foreach ($matches[1] as $tag) {
            if (!in_array($tag, self::TAGS, true)) {
                \WC_Admin_Settings::add_error(sprintf(__('Unknown caption tag: {{%s}}. Use one of the listed tags.', 'kizlo-pos'), $tag));
                return null;
            }
        }
        return $template;
    }

    public static function caption(array $product): string
    {
        $template = get_option(self::TEMPLATE_OPTION, self::DEFAULT_TEMPLATE);
        if (!is_string($template) || trim($template) === '') $template = self::DEFAULT_TEMPLATE;
        $values = [
            '{{name}}' => $product['name'], '{{price}}' => $product['price'] ?? '',
            '{{sku}}' => $product['sku'], '{{description}}' => $product['description'],
            '{{stock}}' => match ($product['stock']) {
                'instock' => __('In stock', 'kizlo-pos'), 'outofstock' => __('Out of stock', 'kizlo-pos'),
                default => __('On backorder', 'kizlo-pos'),
            },
            '{{store_name}}' => html_entity_decode(wp_strip_all_tags(get_bloginfo('name')), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
            '{{url}}' => $product['url'] ?? '',
        ];
        // One literal replacement pass: product content is never evaluated as another template.
        $caption = trim(strtr(sanitize_textarea_field($template), $values));
        return $caption !== '' ? $caption : trim(strtr(self::DEFAULT_TEMPLATE, $values));
    }
}
