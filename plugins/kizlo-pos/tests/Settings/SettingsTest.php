<?php

namespace Kizlo\Pos\Tests\Settings;

use Kizlo\Pos\Modules\Settings\Settings;
use WP_UnitTestCase;

final class SettingsTest extends WP_UnitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (!class_exists('WC_Admin_Settings')) require_once WC_ABSPATH . 'includes/admin/class-wc-admin-settings.php';
        if (!class_exists('WC_Settings_Page')) require_once WC_ABSPATH . 'includes/admin/settings/class-wc-settings-page.php';
        (new Settings())->register();
    }

    public function test_kizlo_tab_has_visible_pos_navigation_and_accepts_other_integrations(): void
    {
        $module = new Settings();
        $pages = $module->pages([]);
        $this->assertCount(1, $pages);
        $page = $pages[0];
        $this->assertSame('kizlo', $page->get_id());
        $this->assertSame('Kizlo', $page->get_label());
        $this->assertSame($pages, $module->pages($pages));
        $this->assertSame(['pos' => 'POS'], $page->get_sections());
        $GLOBALS['current_section'] = '';
        ob_start();
        $page->output_sections();
        $html = (string) ob_get_clean();
        $this->assertStringContainsString('>POS</a>', $html);
        $this->assertStringContainsString('section=pos', $html);
        $this->assertStringContainsString('aria-current="page"', $html);
        add_filter('woocommerce_get_sections_kizlo', static fn(array $sections): array => $sections + ['other' => 'Another integration']);
        add_filter('woocommerce_get_settings_kizlo', static fn(array $fields, string $section): array => $section === 'other' ? [['id' => 'other_field']] : $fields, 20, 2);
        $this->assertSame(['pos' => 'POS', 'other' => 'Another integration'], $page->get_sections());
        $this->assertSame([['id' => 'other_field']], $page->get_settings_for_section('other'));
        $this->assertSame($page->get_settings_for_section('pos'), $page->get_settings_for_section(''));
    }

    public function test_native_settings_save_sanitizes_plain_text_and_rejects_unknown_tags_without_overwriting(): void
    {
        $page = (new Settings())->pages([])[0];
        $fields = $page->get_settings_for_section('pos');
        $template = "{{name}}\n*{{price}}*\n<b>Call us</b>";
        \WC_Admin_Settings::save_fields($fields, [Settings::TEMPLATE_OPTION => $template]);
        $this->assertSame("{{name}}\n*{{price}}*\nCall us", get_option(Settings::TEMPLATE_OPTION));
        $previous = get_option(Settings::TEMPLATE_OPTION);
        \WC_Admin_Settings::save_fields($fields, [Settings::TEMPLATE_OPTION => '{{unknown}}']);
        $this->assertSame($previous, get_option(Settings::TEMPLATE_OPTION));
        ob_start();
        \WC_Admin_Settings::show_messages();
        $this->assertStringContainsString('Unknown caption tag', (string) ob_get_clean());
        \WC_Admin_Settings::save_fields($fields, [Settings::TEMPLATE_OPTION => '']);
        $this->assertSame(Settings::DEFAULT_TEMPLATE, get_option(Settings::TEMPLATE_OPTION));
        $this->assertSame('untouched', (new Settings())->sanitize('untouched', ['id' => 'another_option'], 'raw'));
    }

    public function test_caption_tags_are_literal_plain_text_and_do_not_require_a_website(): void
    {
        update_option('blogname', 'Books & Co');
        $product = ['name' => 'Product {{price}}', 'price' => '$0.00', 'sku' => '', 'description' => 'Cotton', 'stock' => 'outofstock', 'url' => null];
        update_option(Settings::TEMPLATE_OPTION, "{{store_name}}\n{{name}}\n{{price}}\n{{sku}}\n{{description}}\n{{stock}}\n{{url}}");
        $this->assertSame("Books & Co\nProduct {{price}}\n$0.00\n\nCotton\nOut of stock", Settings::caption($product));
        update_option(Settings::TEMPLATE_OPTION, '{{url}}');
        $this->assertSame("Product {{price}}\n$0.00\n\nCotton", Settings::caption($product));
        update_option(Settings::TEMPLATE_OPTION, []);
        $this->assertSame("Product {{price}}\n$0.00\n\nCotton", Settings::caption($product));
        $product['url'] = 'https://shop.example/product';
        update_option(Settings::TEMPLATE_OPTION, '{{url}}');
        $this->assertSame($product['url'], Settings::caption($product));
    }
}
