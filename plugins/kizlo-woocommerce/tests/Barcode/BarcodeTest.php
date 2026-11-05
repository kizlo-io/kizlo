<?php

namespace Kizlo\WooCommerce\Tests\Barcode;

use Kizlo\WooCommerce\Modules\Barcode\Barcode;
use Kizlo\WooCommerce\Modules\Barcode\BarcodeModule;
use Kizlo\WooCommerce\Modules\Barcode\LabelPage;
use Kizlo\WooCommerce\Modules\Barcode\Settings;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_Product_Simple;
use WC_Product_Variable;
use WC_Product_Variation;
use WP_REST_Request;

class BarcodeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        \WC_Install::create_roles();
        // WooCommerce updates the role map; refresh WP_Role objects before checking capabilities.
        wp_roles()->init_roles();
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));
        (new BarcodeModule())->register();
    }

    protected function tearDown(): void
    {
        unset($_POST['kizlo_generate_barcode'], $_POST['kizlo_barcode_nonce'], $_POST['kizlo_barcode_type']);
        delete_option(Settings::TYPE_OPTION);
        unset($_GET['products'], $_GET['barcode_action'], $_POST['kizlo_generate_barcodes'], $_REQUEST['_wpnonce'], $_REQUEST['kizlo_barcode_action_nonce']);
        unset($_POST['action'], $_POST['products'], $_POST['phase'], $_POST['kizlo_regenerate_barcodes'], $_POST['kizlo_barcode_review'], $_POST['kizlo_barcode_signature'], $_POST['kizlo_confirm_barcode_action']);
        parent::tearDown();
    }

    public function test_assignment_uses_the_native_field_and_preserves_sku_stock_and_stability(): void
    {
        $product = new WC_Product_Simple();
        $product->set_name('Inventory product');
        $product->set_sku('MERCHANT-SKU');
        $product->set_manage_stock(true);
        $product->set_stock_quantity(12);
        $product->save();

        $this->assertTrue(Barcode::assign($product));
        $this->assertFalse(Barcode::assign($product));

        $saved = wc_get_product($product->get_id());
        $this->assertMatchesRegularExpression('/^04[0-9]{11}$/', Barcode::value($saved));
        $this->assertSame(Barcode::value($saved), $saved->get_global_unique_id());
        $this->assertSame('', $saved->get_meta(Barcode::LEGACY_KEY));
        $this->assertSame('MERCHANT-SKU', $saved->get_sku());
        $this->assertSame(12, $saved->get_stock_quantity());
    }

    public function test_existing_gtins_keep_leading_zeroes_and_do_not_get_replaced(): void
    {
        $product = new WC_Product_Simple();
        $product->set_global_unique_id('012345678905');
        $product->save();

        $this->assertFalse(Barcode::assign($product));
        $this->assertSame('012345678905', Barcode::value($product));
        $this->assertSame('', $product->get_meta(Barcode::LEGACY_KEY));
    }

    public function test_manual_native_replacement_keeps_one_active_value_without_an_alias(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        Barcode::assign($product);
        $internal = Barcode::value($product);

        $product->set_global_unique_id('012345678905');
        $product->save();

        $this->assertSame('012345678905', Barcode::value($product));
        $this->assertNotSame($internal, Barcode::value($product));
        $this->assertSame('', $product->get_meta(Barcode::LEGACY_KEY));
    }

    public function test_variable_selections_expand_and_deduplicate_into_individually_assigned_variations(): void
    {
        $parent = new WC_Product_Variable();
        $parent->save();
        $variations = [];
        foreach (['blue', 'red'] as $colour) {
            $variation = new WC_Product_Variation();
            $variation->set_parent_id($parent->get_id());
            $variation->set_attributes(['colour' => $colour]);
            $variation->set_regular_price('10');
            $variation->save();
            $variations[] = $variation;
        }

        $selected = (new LabelPage())->products([$parent->get_id(), $variations[0]->get_id()]);
        $this->assertCount(2, $selected);
        $this->assertFalse(Barcode::assign($parent));
        foreach ($selected as $product) $this->assertTrue(Barcode::assign($product));
        $this->assertNotSame(Barcode::value($selected[0]), Barcode::value($selected[1]));
        $this->assertNull(Barcode::value(wc_get_product($parent->get_id())));
    }

    public function test_product_duplication_does_not_copy_the_original_barcode(): void
    {
        if (!class_exists('WC_Admin_Duplicate_Product')) {
            require_once WC_ABSPATH . 'includes/admin/class-wc-admin-duplicate-product.php';
        }
        $product = new WC_Product_Simple();
        $product->save();
        Barcode::assign($product);

        $copy = (new \WC_Admin_Duplicate_Product())->product_duplicate($product);

        $this->assertNull(Barcode::value($copy));
        $this->assertTrue(Barcode::assign($copy));
        $this->assertNotSame(Barcode::value($product), Barcode::value($copy));
    }

    public function test_admin_save_requires_an_explicit_generation_request_and_product_permission(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        $module = new BarcodeModule();

        $module->saveProduct($product);
        $this->assertNull(Barcode::value($product));

        $_POST['kizlo_generate_barcode'][$product->get_id()] = 'yes';
        $_POST['kizlo_barcode_type'][$product->get_id()] = 'ean13';
        $_POST['kizlo_barcode_nonce'][$product->get_id()] = wp_create_nonce('kizlo_barcode_' . $product->get_id());
        wp_set_current_user(self::factory()->user->create(['role' => 'subscriber']));
        $module->saveProduct($product);
        $this->assertNull(Barcode::value($product));
        $this->expectException(\RuntimeException::class);
        (new LabelPage())->products([$product->get_id()]);
    }

    public function test_rest_products_and_variations_expose_the_canonical_value_and_rendering_type(): void
    {
        $parent = new WC_Product_Variable();
        $parent->save();
        $variation = new WC_Product_Variation();
        $variation->set_parent_id($parent->get_id());
        $variation->save();
        Barcode::assign($variation);
        $simple = new WC_Product_Simple();
        $simple->save();
        Barcode::assign($simple);

        $this->bootRestServer();
        foreach ([
            ['/wc/v3/products/' . $simple->get_id(), $simple],
            ['/wc/v3/products/' . $parent->get_id() . '/variations/' . $variation->get_id(), $variation],
        ] as [$route, $product]) {
            $response = rest_get_server()->dispatch(new WP_REST_Request('GET', $route));
            $this->assertSame(200, $response->get_status());
            $meta = array_column($response->get_data()['meta_data'], 'value', 'key');
            $this->assertArrayNotHasKey(Barcode::LEGACY_KEY, $meta);
            $this->assertSame('ean13', $meta[Barcode::TYPE_KEY]);
            $this->assertSame(Barcode::value($product), $response->get_data()['global_unique_id']);
        }
    }

    public function test_print_image_encodes_the_exact_value_without_changing_identifiers(): void
    {
        $image = Barcode::image('012345678905');

        $this->assertStringContainsString('<svg ', $image['svg']);
        $this->assertStringContainsString('<desc>012345678905</desc>', $image['svg']);
        $this->assertGreaterThan(0, $image['modules']);
        $this->assertStringContainsString('preserveAspectRatio="none"', $image['svg']);

        $this->expectException(\InvalidArgumentException::class);
        Barcode::image("123\n456");
    }

    public function test_oversized_batches_fail_before_any_barcodes_are_assigned(): void
    {
        $this->expectException(\RuntimeException::class);
        (new LabelPage())->products(range(1, 201));
    }

    public function test_preparing_labels_only_assigns_barcodes_after_a_valid_generation_request(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        $_GET['products'] = (string) $product->get_id();
        ob_start();
        (new LabelPage())->render();
        $html = (string) ob_get_clean();

        $this->assertNull(Barcode::value(wc_get_product($product->get_id())));
        $this->assertStringContainsString('Generate missing barcodes', $html);

        $_POST['kizlo_generate_barcodes'] = '1';
        $_REQUEST['_wpnonce'] = wp_create_nonce('kizlo_generate_barcodes');
        ob_start();
        (new LabelPage())->render();
        ob_end_clean();

        $this->assertNotNull(Barcode::value(wc_get_product($product->get_id())));
    }

    public function test_generation_rejects_invalid_nonces_without_assigning_a_barcode(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        $_GET['products'] = (string) $product->get_id();
        $_POST['kizlo_generate_barcodes'] = '1';
        $_REQUEST['_wpnonce'] = 'invalid';

        ob_start();
        try {
            (new LabelPage())->render();
            $this->fail('An invalid nonce must reject barcode assignment.');
        } catch (\WPDieException $exception) {
            $this->assertNull(Barcode::value(wc_get_product($product->get_id())));
        } finally {
            ob_end_clean();
        }
    }

    public function test_an_invalid_item_rejects_the_entire_batch_before_assignment(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        $_GET['products'] = $product->get_id() . ',999999999';
        $_POST['kizlo_generate_barcodes'] = '1';
        $_REQUEST['_wpnonce'] = wp_create_nonce('kizlo_generate_barcodes');

        ob_start();
        (new LabelPage())->render();
        $html = (string) ob_get_clean();

        $this->assertStringContainsString('unavailable', $html);
        $this->assertNull(Barcode::value(wc_get_product($product->get_id())));
    }
    public function test_defaults_are_snapshotted_overrides_work_and_stale_retries_preserve_the_first_assignment(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        $stale = wc_get_product($product->get_id());
        update_option(Settings::TYPE_OPTION, 'upc_a');
        Barcode::assign($product);
        $code = Barcode::value($product);
        update_option(Settings::TYPE_OPTION, 'ean8');
        $this->assertFalse(Barcode::assign($stale, 'code39'));
        $this->assertSame($code, Barcode::value(wc_get_product($stale->get_id())));
        $this->assertSame('upc_a', Barcode::type(wc_get_product($stale->get_id())));
        $product->save();
        $this->assertSame($code, Barcode::value(wc_get_product($product->get_id())));

        $other = new WC_Product_Simple();
        $other->save();
        Barcode::assign($other, 'code39');
        $this->assertSame('code39', Barcode::type(wc_get_product($other->get_id())));
        $this->assertMatchesRegularExpression('/^04[0-9]{11}$/', Barcode::value($other));
    }

    /** @dataProvider numberingCases */
    public function test_numbering_and_svg_formats(string $type, string $expected): void
    {
        $this->assertSame($expected, Barcode::number(123, $type));
        $image = Barcode::image($expected, $type);
        $this->assertStringContainsString('<svg ', $image['svg']);
        $this->assertGreaterThan(0, $image['modules']);
        $this->assertStringContainsString('preserveAspectRatio="none"', $image['svg']);
        $this->assertGreaterThanOrEqual(10, $image['quiet']);
    }

    public static function numberingCases(): array
    {
        return [
            ...array_map(static fn(array $fixture): array => [$fixture['type'], $fixture['value']], json_decode(file_get_contents(__DIR__ . '/fixtures/scanner-formats.json'), true, 512, JSON_THROW_ON_ERROR)),
        ];
    }

    /** @dataProvider invalidValues */
    public function test_invalid_values_and_types_are_rejected_without_repair(string $value, string $type): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Barcode::image($value, $type);
    }

    public static function invalidValues(): array
    {
        return [
            ['0400000001231', 'ean13'], ['400000001231', 'upc_a'], ['20001232', 'ean8'],
            ['123', 'ean13'], ['012345678905', 'ean13'], ['lowercase', 'code39'],
            ['ABC*DEF', 'code39'], ["123\n456", 'code128'], ['123', 'qr'],
        ];
    }

    public function test_sequence_capacity_errors_never_truncate(): void
    {
        $this->assertSame(8, strlen(Barcode::number(999999, 'ean8')));
        $this->expectException(\InvalidArgumentException::class);
        Barcode::number(1000000, 'ean8');
    }

    public function test_legacy_values_are_not_active_aliases_or_silently_overwritten(): void
    {
        $product = new WC_Product_Simple();
        $product->update_meta_data(Barcode::LEGACY_KEY, 'KZ-123');
        $product->save();
        $this->assertNull(Barcode::value($product));
        try {
            Barcode::assign($product);
            $this->fail('Draft data must be migrated explicitly.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('KZ-123', wc_get_product($product->get_id())->get_meta(Barcode::LEGACY_KEY));
        }
        $product->set_global_unique_id('20001230');
        $product->save();
        $this->assertNull(Barcode::type($product));
        Barcode::saveType($product, 'ean8');
        $this->assertSame('ean8', Barcode::type(wc_get_product($product->get_id())));
        $this->assertSame('20001230', Barcode::value($product));
    }

    public function test_allocation_skips_equivalent_native_and_legacy_collisions(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        $other = new WC_Product_Simple();
        $other->set_global_unique_id(Barcode::number(123, 'upc_a'));
        $other->save();
        update_option(Barcode::SEQUENCE_OPTION . 'retail', 122, false);
        Barcode::assign($product, 'ean13');
        $this->assertSame(Barcode::number(124, 'ean13'), Barcode::value($product));
        $other->update_meta_data(Barcode::LEGACY_KEY, Barcode::number(125, 'ean13'));
        $other->save();
        $third = new WC_Product_Simple();
        $third->save();
        Barcode::assign($third);
        $this->assertSame(Barcode::number(126, 'ean13'), Barcode::value($third));
    }

    public function test_invalid_override_preserves_existing_metadata(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        Barcode::assign($product, 'code128');
        try {
            Barcode::saveType($product, 'ean8');
            $this->fail('An incompatible override must fail.');
        } catch (\InvalidArgumentException $exception) {
            $this->assertSame('code128', Barcode::type(wc_get_product($product->get_id())));
        }
    }

    public function test_variation_duplication_excludes_both_value_and_type(): void
    {
        if (!class_exists('WC_Admin_Duplicate_Product')) require_once WC_ABSPATH . 'includes/admin/class-wc-admin-duplicate-product.php';
        $parent = new WC_Product_Variable();
        $parent->save();
        $child = new WC_Product_Variation();
        $child->set_parent_id($parent->get_id());
        $child->set_regular_price('10');
        $child->save();
        Barcode::assign($child, 'code128');
        $parent = wc_get_product($parent->get_id());
        $copy = (new \WC_Admin_Duplicate_Product())->product_duplicate($parent);
        $children = $copy->get_children();
        $this->assertCount(1, $children);
        $duplicate = wc_get_product($children[0]);
        $this->assertNull(Barcode::value($duplicate));
        $this->assertSame('', $duplicate->get_meta(Barcode::TYPE_KEY));
    }

    public function test_editor_assignment_and_type_override_require_valid_nonce_and_permission(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        $id = $product->get_id();
        $_POST['kizlo_generate_barcode'][$id] = 'yes';
        $_POST['kizlo_barcode_type'][$id] = 'code39';
        $_POST['kizlo_barcode_nonce'][$id] = 'invalid';
        $module = new BarcodeModule();
        $module->saveProduct($product);
        $this->assertNull(Barcode::value($product));
        $_POST['kizlo_barcode_nonce'][$id] = wp_create_nonce('kizlo_barcode_' . $id);
        $module->saveProduct($product);
        $this->assertSame('code39', Barcode::type(wc_get_product($id)));
        unset($_POST['kizlo_generate_barcode']);
        $_POST['kizlo_barcode_type'][$id] = 'code128';
        $module->saveProduct($product);
        $this->assertSame('code128', Barcode::type(wc_get_product($product->get_id())));
    }

    public function test_settings_use_woocommerce_registration_and_validate_numeric_defaults(): void
    {
        if (!class_exists('WC_Admin_Settings')) require_once WC_ABSPATH . 'includes/admin/class-wc-admin-settings.php';
        $settings = new Settings();
        $fields = $settings->fields([], 'kizlo_barcodes');
        $this->assertSame('ean13', Settings::defaultType());
        $this->assertArrayHasKey('kizlo_barcodes', apply_filters('woocommerce_get_sections_products', []));
        $this->assertSame(['existing'], $settings->fields(['existing'], 'inventory'));
        $width = array_values(array_filter($fields, static fn(array $field): bool => $field['id'] === Settings::PREFIX . 'width'))[0];
        $this->assertNull($settings->sanitize('0', $width, '0'));
        $this->assertNull($settings->sanitize('abc', $width, ['bad']));
        $this->assertSame('60.5', $settings->sanitize('60.5', $width, '60.5'));
        $this->assertSame(50.0, Settings::layout()['width']);
    }

    public function test_shop_manager_can_prepare_labels_but_an_uneditable_selection_is_atomic(): void
    {
        wp_set_current_user(self::factory()->user->create(['role' => 'shop_manager']));
        $product = new WC_Product_Simple();
        $product->save();
        $this->assertCount(1, (new LabelPage())->products([$product->get_id()]));
        $denied = static fn(array $caps, string $cap, int $user, array $args): array => $cap === 'edit_post' && ($args[0] ?? 0) === $product->get_id() ? ['do_not_allow'] : $caps;
        add_filter('map_meta_cap', $denied, 10, 4);
        try {
            (new LabelPage())->products([$product->get_id()]);
            $this->fail('Per-item permissions must be checked.');
        } catch (\RuntimeException $exception) {
            $this->assertNull(Barcode::value(wc_get_product($product->get_id())));
        } finally { remove_filter('map_meta_cap', $denied, 10); }
    }

    public function test_assignment_waits_for_other_database_connections_and_retries_safely(): void
    {
        global $wpdb;
        $product = new WC_Product_Simple();
        $product->save();
        $connection = new \wpdb(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST);
        $lock = 'kizlo_barcode_' . substr(hash('sha256', $wpdb->postmeta), 0, 40);
        $connection->get_var($connection->prepare('SELECT GET_LOCK(%s, 0)', $lock));
        try {
            Barcode::assign($product);
            $this->fail('A competing assignment must not write outside the lock.');
        } catch (\RuntimeException $exception) {
            $this->assertNull(Barcode::value(wc_get_product($product->get_id())));
            $this->assertStringContainsString('busy', $exception->getMessage());
        } finally {
            $connection->get_var($connection->prepare('SELECT RELEASE_LOCK(%s)', $lock));
            $connection->close();
        }
        $this->assertTrue(Barcode::assign($product));
        $this->assertMatchesRegularExpression('/^04[0-9]{11}$/', Barcode::value($product));
    }

    public function test_editor_preserves_other_pending_metadata(): void
    {
        $product = new WC_Product_Simple();
        $product->save();
        $product->update_meta_data('_another_plugin_value', 'pending');
        Barcode::assign($product);
        $this->assertSame('pending', $product->get_meta('_another_plugin_value'));
        $product->update_meta_data('_another_plugin_value', 'changed');
        Barcode::saveType($product, 'code128');
        $product->save();
        $saved = wc_get_product($product->get_id());
        $this->assertSame('changed', $saved->get_meta('_another_plugin_value'));
        $this->assertSame('code128', Barcode::type($saved));
    }

    public function test_variation_editor_saves_an_explicit_override_and_routine_saves_keep_it(): void
    {
        $parent = new WC_Product_Variable();
        $parent->save();
        $variation = new WC_Product_Variation();
        $variation->set_parent_id($parent->get_id());
        $variation->save();
        $id = $variation->get_id();
        $_POST['kizlo_barcode_type'][$id] = 'ean8';
        $_POST['kizlo_generate_barcode'][$id] = 'yes';
        $_POST['kizlo_barcode_nonce'][$id] = wp_create_nonce('kizlo_barcode_' . $id);
        (new BarcodeModule())->saveVariation($variation, 0);
        $saved = wc_get_product($id);
        $this->assertSame('ean8', Barcode::type($saved));
        $this->assertMatchesRegularExpression('/^2[0-9]{7}$/', Barcode::value($saved));
        unset($_POST['kizlo_generate_barcode']);
        update_option(Settings::TYPE_OPTION, 'code128');
        (new BarcodeModule())->saveVariation($saved, 0);
        $this->assertSame('ean8', Barcode::type(wc_get_product($id)));
        $this->assertNull(Barcode::value(wc_get_product($parent->get_id())));
    }

    public function test_expanded_variations_over_the_limit_reject_the_entire_selection(): void
    {
        $parent = new WC_Product_Variable();
        $parent->save();
        for ($index = 0; $index < 201; $index++) {
            $variation = new WC_Product_Variation();
            $variation->set_parent_id($parent->get_id());
            $variation->save();
        }
        $parent = wc_get_product($parent->get_id());
        $this->expectException(\RuntimeException::class);
        (new LabelPage())->products([$parent->get_id()]);
    }

    private function productWithCode(string $code = '012345678905'): WC_Product_Simple
    {
        $product = new WC_Product_Simple();
        $product->set_global_unique_id($code);
        $product->set_sku('barcode-' . wp_generate_password(8, false));
        $product->set_manage_stock(true);
        $product->set_stock_quantity(5);
        $product->set_regular_price('12');
        $product->save();
        return $product;
    }

    public function test_regeneration_can_replace_a_manufacturer_gtin_and_same_format_again(): void
    {
        $product = $this->productWithCode();
        $review = [Barcode::snapshot($product)];
        $result = Barcode::regenerate([$product], $review);
        $this->assertSame(1, $result['replaced']);
        $saved = wc_get_product($product->get_id());
        $first = Barcode::value($saved);
        $this->assertNotSame('012345678905', $first);
        $this->assertSame('upc_a', Barcode::type($saved));
        $this->assertSame($product->get_sku(), $saved->get_sku());
        $this->assertSame(5, $saved->get_stock_quantity());
        $this->assertSame('12', $saved->get_regular_price());
        $this->assertSame('', $saved->get_meta(Barcode::LEGACY_KEY));
        Barcode::regenerate([$saved], [Barcode::snapshot($saved)]);
        $this->assertNotSame($first, Barcode::value(wc_get_product($saved->get_id())));
        $this->expectException(\RuntimeException::class);
        Barcode::regenerate([$product], $review);
    }

    public function test_a_changed_item_rejects_the_whole_regeneration_before_writes(): void
    {
        $first = $this->productWithCode();
        $second = $this->productWithCode('400000001234');
        $review = array_map([Barcode::class, 'snapshot'], [$first, $second]);
        $second->set_global_unique_id('20001230');
        $second->save();
        try {
            Barcode::regenerate([$first, $second], $review);
            $this->fail('A stale review must reject the full batch.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('012345678905', Barcode::value(wc_get_product($first->get_id())));
            $this->assertSame('20001230', Barcode::value(wc_get_product($second->get_id())));
        }
    }

    public function test_a_direct_database_change_is_seen_despite_cached_native_properties(): void
    {
        global $wpdb;
        $product = $this->productWithCode();
        $review = [Barcode::snapshot($product)];
        $wpdb->update($wpdb->postmeta, ['meta_value' => '400000001234'], ['post_id' => $product->get_id(), 'meta_key' => '_global_unique_id']);
        $this->expectException(\RuntimeException::class);
        Barcode::regenerate([$product], $review);
    }

    public function test_regeneration_rechecks_permissions_for_all_items(): void
    {
        $product = $this->productWithCode();
        $review = [Barcode::snapshot($product)];
        wp_set_current_user(self::factory()->user->create(['role' => 'subscriber']));
        try {
            Barcode::regenerate([$product], $review);
            $this->fail('Uneditable items must not be replaced.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('012345678905', Barcode::value(wc_get_product($product->get_id())));
        }
    }

    private function postReview(array $products, string $action = 'kizlo_regenerate_barcodes'): void
    {
        $review = LabelPage::review($products, $action);
        $_POST['action'] = $action;
        $_POST['products'] = implode(',', array_map(static fn($p) => $p->get_id(), $products));
        $_POST['phase'] = 'confirm';
        $_POST['kizlo_barcode_review'] = wp_slash($review['payload']);
        $_POST['kizlo_barcode_signature'] = $review['signature'];
        $_POST['kizlo_confirm_barcode_action'] = 'yes';
        $_REQUEST['kizlo_barcode_action_nonce'] = wp_create_nonce('kizlo_barcode_action');
    }

    private function requestAction(): string
    {
        $_POST['action'] ??= 'kizlo_regenerate_barcodes';
        $handler = static fn() => static function ($message) { throw new \WPDieException((string) $message); };
        add_filter('wp_doing_ajax', '__return_true');
        add_filter('wp_die_ajax_handler', $handler);
        ob_start();
        try { (new LabelPage())->handleAction(); }
        catch (\WPDieException $exception) { echo $exception->getMessage(); }
        finally {
            $result = (string) ob_get_clean();
            remove_filter('wp_doing_ajax', '__return_true');
            remove_filter('wp_die_ajax_handler', $handler);
        }
        return $result;
    }

    public function test_preparation_and_cancel_are_read_only_and_confirmation_is_replay_safe(): void
    {
        $product = $this->productWithCode();
        $_POST['products'] = (string) $product->get_id();
        $_POST['phase'] = 'prepare';
        $_REQUEST['kizlo_barcode_action_nonce'] = wp_create_nonce('kizlo_barcode_action');
        $prepared = json_decode($this->requestAction(), true);
        $this->assertTrue($prepared['success']);
        $this->assertArrayHasKey('signature', $prepared['data']);
        $this->assertSame('012345678905', Barcode::value(wc_get_product($product->get_id())));
        $this->postReview([$product]);
        $this->assertStringContainsString('Replaced 1 barcode.', $this->requestAction());
        $assigned = Barcode::value(wc_get_product($product->get_id()));
        $this->assertNotSame('012345678905', $assigned);
        $this->assertStringContainsString('already regenerated', $this->requestAction());
        $this->assertSame($assigned, Barcode::value(wc_get_product($product->get_id())));
        $redirect = admin_url('edit.php?post_type=product&paged=2');
        $this->assertSame($redirect, (new LabelPage())->handleBulkAction($redirect, 'kizlo_regenerate_barcodes', [$product->get_id()]));
    }

    public function test_confirmation_requires_acknowledgement_signature_selection_and_nonce(): void
    {
        $product = $this->productWithCode();
        $this->postReview([$product]);
        unset($_POST['kizlo_confirm_barcode_action']);
        $this->assertStringContainsString('Confirm this barcode action', $this->requestAction());
        $this->postReview([$product]);
        $_POST['kizlo_barcode_signature'] = 'tampered';
        $this->assertStringContainsString('Invalid barcode confirmation', $this->requestAction());
        $other = $this->productWithCode('400000001234');
        $this->postReview([$product]);
        $_POST['products'] .= ',' . $other->get_id();
        $this->assertStringContainsString('selection changed', $this->requestAction());
        $this->postReview([$product]);
        $_REQUEST['kizlo_barcode_action_nonce'] = 'bad';
        $this->assertSame('-1', $this->requestAction());
        $this->assertSame('012345678905', Barcode::value(wc_get_product($product->get_id())));
        $this->postReview([$product]);
        wp_set_current_user(self::factory()->user->create(['role' => 'subscriber']));
        $_REQUEST['kizlo_barcode_action_nonce'] = wp_create_nonce('kizlo_barcode_action');
        $this->assertStringContainsString('cannot edit products', $this->requestAction());
        $this->assertSame('400000001234', Barcode::value(wc_get_product($other->get_id())));
    }

    public function test_generation_counts_expanded_variations_and_only_assigns_missing_values(): void
    {
        $parent = new WC_Product_Variable();
        $parent->save();
        $variations = [];
        foreach (['012345678905', ''] as $code) {
            $variation = new WC_Product_Variation();
            $variation->set_parent_id($parent->get_id());
            $variation->set_regular_price('10');
            $variation->set_global_unique_id($code);
            $variation->save();
            $variations[] = $variation;
        }
        $existing = $this->productWithCode('400000001234');
        $missing = new WC_Product_Simple();
        $missing->update_meta_data(Barcode::TYPE_KEY, 'code39');
        $missing->save();
        $_POST['action'] = 'kizlo_generate_barcodes';
        $_POST['products'] = implode(',', [$parent->get_id(), $variations[0]->get_id(), $existing->get_id(), $missing->get_id()]);
        $_POST['phase'] = 'prepare';
        $_REQUEST['kizlo_barcode_action_nonce'] = wp_create_nonce('kizlo_barcode_action');
        $prepared = json_decode($this->requestAction(), true)['data'];
        $this->assertSame(2, $prepared['missing']);
        $this->assertSame('2 items will get a barcode. 2 items already have one and will stay unchanged.', $prepared['message']);
        $this->assertCount(4, json_decode($prepared['payload'], true));
        $this->assertNull(Barcode::value(wc_get_product($missing->get_id())));
        $this->assertNull(Barcode::value(wc_get_product($variations[1]->get_id())));

        $_POST['phase'] = 'confirm';
        $_POST['kizlo_barcode_review'] = wp_slash($prepared['payload']);
        $_POST['kizlo_barcode_signature'] = $prepared['signature'];
        $_POST['kizlo_confirm_barcode_action'] = 'yes';
        $this->assertStringContainsString('Assigned 2 barcodes. Kept 2 existing barcodes unchanged.', $this->requestAction());
        $assigned = Barcode::value(wc_get_product($missing->get_id()));
        $this->assertNotNull($assigned);
        $this->assertSame('code39', Barcode::type(wc_get_product($missing->get_id())));
        $this->assertNotNull(Barcode::value(wc_get_product($variations[1]->get_id())));
        $this->assertNull(Barcode::value(wc_get_product($parent->get_id())));
        $this->assertSame('012345678905', Barcode::value(wc_get_product($variations[0]->get_id())));
        $this->assertSame('400000001234', Barcode::value(wc_get_product($existing->get_id())));
        $this->assertStringContainsString('barcodes changed', $this->requestAction());
        $this->assertSame($assigned, Barcode::value(wc_get_product($missing->get_id())));
        $_POST['phase'] = 'prepare';
        $prepared = json_decode($this->requestAction(), true)['data'];
        $this->assertSame(0, $prepared['missing']);
        $this->assertSame('All 4 selected items already have barcodes. Choose Regenerate barcodes to replace them.', $prepared['message']);
        $_POST['products'] = (string) $existing->get_id();
        $prepared = json_decode($this->requestAction(), true)['data'];
        $this->assertSame(0, $prepared['missing']);
        $this->assertSame('This item already has a barcode. Choose Regenerate barcodes to replace it.', $prepared['message']);
        $redirect = admin_url('edit.php?post_type=product&paged=2');
        $this->assertSame($redirect, (new LabelPage())->handleBulkAction($redirect, 'kizlo_generate_barcodes', [$parent->get_id()]));
    }

    public function test_generation_rejects_a_changed_selection_or_a_confirmation_for_another_action(): void
    {
        $first = new WC_Product_Simple();
        $first->save();
        $second = new WC_Product_Simple();
        $second->save();
        $this->postReview([$first, $second], 'kizlo_generate_barcodes');
        $_POST['action'] = 'kizlo_regenerate_barcodes';
        $this->assertStringContainsString('Invalid barcode confirmation', $this->requestAction());
        $this->assertNull(Barcode::value(wc_get_product($first->get_id())));
        $this->postReview([$first, $second], 'kizlo_generate_barcodes');
        Barcode::assign($second);
        $this->assertStringContainsString('barcodes changed', $this->requestAction());
        $this->assertNull(Barcode::value(wc_get_product($first->get_id())));
        $this->assertSame(Barcode::value($second), Barcode::value(wc_get_product($second->get_id())));
    }

    public function test_sequences_do_not_recycle_deleted_or_replaced_codes_and_share_upc_ean_space(): void
    {
        $product = $this->productWithCode(Barcode::number(500, 'upc_a'));
        update_option(Barcode::SEQUENCE_OPTION . 'retail', 1, false);
        Barcode::regenerate([$product], [Barcode::snapshot($product)]);
        $this->assertSame(Barcode::number(501, 'upc_a'), Barcode::value(wc_get_product($product->get_id())));
        $product->delete(true);
        $other = new WC_Product_Simple();
        $other->save();
        Barcode::assign($other, 'ean13');
        $this->assertSame(Barcode::number(502, 'ean13'), Barcode::value($other));
    }

    public function test_sequence_exhaustion_does_not_change_the_current_barcode(): void
    {
        $product = $this->productWithCode();
        update_option(Barcode::SEQUENCE_OPTION . 'retail', 9999999999, false);
        $result = Barcode::regenerate([$product], [Barcode::snapshot($product)]);
        $this->assertSame(0, $result['replaced']);
        $this->assertArrayHasKey($product->get_id(), $result['failures']);
        $this->assertSame('012345678905', Barcode::value(wc_get_product($product->get_id())));
    }

}
