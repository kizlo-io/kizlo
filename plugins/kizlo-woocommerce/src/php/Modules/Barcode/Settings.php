<?php

namespace Kizlo\WooCommerce\Modules\Barcode;

final class Settings
{
    public const TYPE_OPTION = 'kizlo_woocommerce_barcode_type';
    public const PREFIX = 'kizlo_woocommerce_barcode_';
    public const LAYOUT = [
        'width' => ['Label width (mm)', 50, 10, 200],
        'height' => ['Label height (mm)', 30, 10, 200],
        'margin-x' => ['Sheet left/right margin (mm)', 10, 0, 100],
        'margin-y' => ['Sheet top/bottom margin (mm)', 10, 0, 140],
        'gap-x' => ['Column gap (mm)', 2, 0, 50],
        'gap-y' => ['Row gap (mm)', 2, 0, 50],
    ];

    public function register(): void
    {
        add_filter('woocommerce_get_sections_products', static fn(array $sections): array => $sections + ['kizlo_barcodes' => __('Barcodes', 'kizlo-woocommerce')]);
        add_filter('woocommerce_get_settings_products', [$this, 'fields'], 10, 2);
        add_filter('woocommerce_admin_settings_sanitize_option', [$this, 'sanitize'], 10, 3);
    }

    public static function defaultType(): string
    {
        $type = get_option(self::TYPE_OPTION, 'ean13');
        return is_string($type) && isset(Barcode::TYPES[$type]) ? $type : 'ean13';
    }

    public static function layout(): array
    {
        $layout = ['format' => get_option(self::PREFIX . 'format', 'a4') === 'thermal' ? 'thermal' : 'a4'];
        foreach (self::LAYOUT as $key => [$label, $default, $min, $max]) {
            $raw = get_option(self::PREFIX . $key, $default);
            $layout[$key] = is_numeric($raw) && is_finite((float) $raw) && $raw >= $min && $raw <= $max ? (float) $raw : $default;
        }
        return $layout;
    }

    public function fields(array $settings, string $section): array
    {
        if ($section !== 'kizlo_barcodes') return $settings;
        $fields = [
            ['type' => 'title', 'id' => 'kizlo_barcodes', 'title' => __('Barcodes', 'kizlo-woocommerce'), 'desc' => __('Generated numbers are store-scoped identifiers, not globally allocated GTINs. Changing the default affects new assignments only.', 'kizlo-woocommerce')],
            ['type' => 'select', 'id' => self::TYPE_OPTION, 'title' => __('Default barcode type', 'kizlo-woocommerce'), 'default' => 'ean13', 'options' => Barcode::TYPES],
            ['type' => 'select', 'id' => self::PREFIX . 'format', 'title' => __('Print format', 'kizlo-woocommerce'), 'default' => 'a4', 'options' => ['a4' => __('A4 label sheet', 'kizlo-woocommerce'), 'thermal' => __('Thermal labels', 'kizlo-woocommerce')]],
        ];
        foreach (self::LAYOUT as $key => [$label, $default, $min, $max]) {
            $fields[] = ['type' => 'number', 'id' => self::PREFIX . $key, 'title' => __($label, 'kizlo-woocommerce'), 'default' => $default, 'custom_attributes' => ['min' => $min, 'max' => $max, 'step' => '0.1']];
        }
        $fields[] = ['type' => 'sectionend', 'id' => 'kizlo_barcodes'];
        return $fields;
    }

    public function sanitize(mixed $value, array $option, mixed $raw): mixed
    {
        $key = str_starts_with($option['id'] ?? '', self::PREFIX) ? substr($option['id'], strlen(self::PREFIX)) : '';
        if (!isset(self::LAYOUT[$key])) return $value;
        [, , $min, $max] = self::LAYOUT[$key];
        if (!is_numeric($raw) || !is_finite((float) $raw) || $raw < $min || $raw > $max) {
            \WC_Admin_Settings::add_error(sprintf(__('Invalid %s. Enter a value between %s and %s mm.', 'kizlo-woocommerce'), $option['title'], $min, $max));
            return null;
        }
        return (string) (float) $raw;
    }
}
