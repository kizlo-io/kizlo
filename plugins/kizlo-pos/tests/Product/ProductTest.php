<?php

namespace Kizlo\Pos\Tests\Product;

use Kizlo\Pos\Modules\Product\ProductModule;
use WC_Product_Simple;
use WC_Product_Variable;
use WC_Product_Variation;
use WP_REST_Request;
use WP_UnitTestCase;

final class ProductTest extends WP_UnitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        \WC_Install::create_roles();
        wp_roles()->init_roles();
        wp_set_current_user(self::factory()->user->create(['role' => 'shop_manager']));
        global $wp_rest_server;
        $wp_rest_server = null;
        (new ProductModule())->register();
        rest_get_server();
    }

    protected function tearDown(): void
    {
        wp_set_current_user(0);
        parent::tearDown();
    }

    private function product(string $name, string $status = 'publish', string $sku = ''): WC_Product_Simple
    {
        $product = new WC_Product_Simple();
        $product->set_name($name);
        $product->set_status($status);
        $product->set_regular_price('10');
        $product->set_sku($sku);
        $product->save();
        return $product;
    }

    private function request(string $suffix = '', array $query = []): \WP_REST_Response
    {
        $request = new WP_REST_Request('GET', '/kizlo-pos/v1/products' . $suffix);
        $request->set_query_params($query);
        return rest_do_request($request);
    }

    public function test_staff_access_and_denied_accounts_preserve_their_capabilities(): void
    {
        $product = $this->product('Staff catalog');
        foreach (['administrator', 'shop_manager', 'customer', 'subscriber'] as $role) {
            wp_set_current_user(self::factory()->user->create(['role' => $role]));
            $before = current_user_can('manage_options');
            $response = $this->request('/' . $product->get_id());
            $this->assertSame(in_array($role, ['administrator', 'shop_manager']) ? 200 : 403, $response->get_status());
            $this->assertSame($before, current_user_can('manage_options'));
        }
        wp_set_current_user(0);
        $this->assertSame(401, $this->request()->get_status());
    }

    public function test_partial_names_exact_identifiers_and_hidden_products(): void
    {
        $named = $this->product('Canvas shoe');
        $sku = $this->product('Another item', 'publish', 'Canvas');
        $partial = $this->product('No title match', 'publish', 'Canvas-extra');
        $partial->set_description('Canvas');
        $partial->save();
        $private = $this->product('Canvas private', 'private', 'secret-sku');
        $draft = $this->product('Canvas draft', 'draft');
        $locked = $this->product('Canvas protected');
        wp_update_post(['ID' => $locked->get_id(), 'post_password' => 'protected']);
        $result = $this->request('', ['search' => 'Canvas'])->get_data();
        $this->assertSame([$sku->get_id(), $named->get_id()], array_column($result['items'], 'id'));
        $this->assertSame(2, $result['total']);
        foreach ([$private, $draft, $locked] as $hidden) $this->assertSame(404, $this->request('/' . $hidden->get_id())->get_status());
        $this->assertSame([], $this->request('', ['search' => 'secret-sku'])->get_data()['items']);
        $this->assertSame(1, count(wc_get_products(['status' => 'private', 'include' => [$private->get_id()]])));
        $this->assertSame(['sentinel' => true], (new ProductModule())->queryArgs(['sentinel' => true], []));
    }

    public function test_search_paging_counts_and_exact_match_deduplication(): void
    {
        $ids = [];
        for ($i = 0; $i < 26; $i++) $ids[] = $this->product(sprintf('Page shoe %02d', $i))->get_id();
        $exact = wc_get_product($ids[25]);
        $exact->set_sku('Page shoe');
        $exact->save();
        $first = $this->request('', ['search' => 'Page shoe'])->get_data();
        $second = $this->request('', ['search' => 'Page shoe', 'page' => 2])->get_data();
        $this->assertCount(24, $first['items']);
        $this->assertSame($ids[25], $first['items'][0]['id']);
        $this->assertCount(2, $second['items']);
        $combined = array_merge(array_column($first['items'], 'id'), array_column($second['items'], 'id'));
        $this->assertCount(26, array_unique($combined));
        $this->assertSame(26, $first['total']);
        $this->assertTrue($first['has_more']);
        $this->assertFalse($second['has_more']);
        $this->assertStringContainsString('no-store', $this->request()->get_headers()['Cache-Control']);
    }

    public function test_variation_lookup_parent_visibility_and_bounded_variation_pages(): void
    {
        $parent = new WC_Product_Variable();
        $parent->set_name('Variable shirt');
        $parent->set_status('publish');
        $parent->save();
        $children = [];
        for ($i = 0; $i < 25; $i++) {
            $child = new WC_Product_Variation();
            $child->set_parent_id($parent->get_id());
            $child->set_status('publish');
            $child->set_regular_price('12');
            $child->set_sku('variation-' . $i);
            if ($i === 0) $child->set_global_unique_id('0123456789012');
            $child->save();
            $children[] = $child->get_id();
        }
        WC_Product_Variable::sync($parent->get_id());
        $result = $this->request('', ['search' => '123456789012'])->get_data();
        $this->assertSame([$parent->get_id()], array_column($result['items'], 'id'));
        $this->assertSame([$children[0]], $result['items'][0]['matched_variations']);
        $detail = $this->request('/' . $children[0])->get_data();
        $this->assertSame($parent->get_id(), $detail['parent_id']);
        $this->assertSame('variation-0', $detail['sku']);
        $this->assertCount(24, $this->request('/' . $parent->get_id() . '/variations')->get_data()['items']);
        $this->assertCount(1, $this->request('/' . $parent->get_id() . '/variations', ['page' => 2])->get_data()['items']);
        $parent->set_status('private');
        $parent->save();
        $this->assertSame(404, $this->request('/' . $children[0])->get_status());
        $this->assertSame([], $this->request('', ['search' => 'variation-0'])->get_data()['items']);
        $this->assertSame(404, $this->request('/' . $parent->get_id() . '/variations')->get_status());
    }

    public function test_zero_missing_sale_prices_stock_and_plain_description(): void
    {
        $product = $this->product('Price example');
        $product->set_sale_price('0');
        $product->set_price('0');
        $product->set_stock_status('outofstock');
        $product->set_description('<p>Safe &amp; useful</p>');
        $product->save();
        $data = $this->request('/' . $product->get_id())->get_data();
        $this->assertNotNull($data['price']);
        $this->assertStringNotContainsString('10.00', $data['price']);
        $this->assertSame('outofstock', $data['stock']);
        $this->assertSame('Safe & useful', $data['description']);
        $this->assertNull($data['image']);
        $this->assertStringNotContainsString('wp-admin', $data['url']);
        $product->set_regular_price('');
        $product->set_sale_price('');
        $product->set_price('');
        $product->save();
        $this->assertNull($this->request('/' . $product->get_id())->get_data()['price']);
    }

    public function test_plain_description_and_caption_preserve_html_text_boundaries(): void
    {
        $product = $this->product('Cotton shirt');
        $product->set_description('<p>Pure &amp; soft cotton</p><p>Machine washable<br />Cold water</p><ul><li>Small</li><li>Large</li></ul>');
        $product->save();
        $data = $this->request('/' . $product->get_id())->get_data();
        $description = "Pure & soft cotton\nMachine washable\nCold water\nSmall\nLarge";
        $this->assertSame($description, $data['description']);
        $this->assertStringContainsString($description, $data['share_text']);
    }

    public function test_variation_description_falls_back_through_parent_descriptions(): void
    {
        $parent = new WC_Product_Variable();
        $parent->set_name('Cotton shirt');
        $parent->set_status('publish');
        $parent->set_short_description('Pure cotton, machine washable');
        $parent->save();
        $child = new WC_Product_Variation();
        $child->set_parent_id($parent->get_id());
        $child->set_status('publish');
        $child->set_regular_price('10');
        $child->save();
        $data = $this->request('/' . $child->get_id())->get_data();
        $this->assertSame('Pure cotton, machine washable', $data['description']);
        $this->assertStringContainsString($data['description'], $data['share_text']);
        $parent->set_description('Parent full description');
        $parent->save();
        $this->assertSame('Parent full description', $this->request('/' . $child->get_id())->get_data()['description']);
        $child->set_description('Variation description');
        $child->save();
        $this->assertSame('Variation description', $this->request('/' . $child->get_id())->get_data()['description']);
    }

    public function test_bad_query_parameters_are_rejected(): void
    {
        foreach ([['page' => 0], ['page' => 'oops'], ['search' => ['bad']], ['search' => str_repeat('x', 201)], ['status' => 'private'], ['per_page' => -1]] as $query) {
            $this->assertSame(400, $this->request('', $query)->get_status());
        }
        $this->assertSame(404, $this->request('/99999999')->get_status());
    }

    private function image(string $name): int
    {
        $id = self::factory()->attachment->create(['post_mime_type' => 'image/jpeg', 'guid' => home_url('/wp-content/uploads/' . $name)]);
        update_post_meta($id, '_wp_attached_file', $name);
        return $id;
    }

    public function test_detail_uses_only_the_main_image_and_omits_gallery_payloads(): void
    {
        $main = $this->image('main.jpg');
        $gallery = $this->image('gallery.jpg');
        $product = $this->product('Single image product');
        $product->set_image_id($main);
        $product->set_gallery_image_ids([$gallery]);
        $product->save();
        $data = $this->request('/' . $product->get_id())->get_data();
        $this->assertSame(wp_get_attachment_image_url($main, 'large'), $data['image']['url']);
        $this->assertArrayNotHasKey('images', $data);
        $this->assertSame("Single image product\n" . $data['price'], $data['share_text']);
        $product->set_image_id(0);
        $product->save();
        $this->assertNull($this->request('/' . $product->get_id())->get_data()['image']);
    }

    public function test_variation_sharing_uses_its_image_and_caption_values_with_parent_image_fallback(): void
    {
        $parentMain = $this->image('parent-main.jpg');
        $ownMain = $this->image('own-main.jpg');
        $parent = new WC_Product_Variable();
        $parent->set_name('Cotton shirt');
        $parent->set_status('publish');
        $parent->set_image_id($parentMain);
        $parent->set_description('Parent description');
        $parent->save();
        $child = new WC_Product_Variation();
        $child->set_parent_id($parent->get_id());
        $child->set_status('publish');
        $child->set_regular_price('0');
        $child->set_sku('SMALL-SHIRT');
        $child->set_description('Small size');
        $child->set_image_id($ownMain);
        $child->save();
        update_option(\Kizlo\Pos\Modules\Settings\Settings::TEMPLATE_OPTION, "{{name}}\n{{sku}} / {{price}}\n{{description}}\n{{stock}}");
        $data = $this->request('/' . $child->get_id())->get_data();
        $this->assertSame(wp_get_attachment_image_url($ownMain, 'large'), $data['image']['url']);
        $this->assertSame($data['name'] . "\nSMALL-SHIRT / " . $data['price'] . "\nSmall size\nIn stock", $data['share_text']);
        $child->set_image_id(0);
        $child->save();
        $this->assertSame(wp_get_attachment_image_url($parentMain, 'large'), $this->request('/' . $child->get_id())->get_data()['image']['url']);
        $parent->set_status('private');
        $parent->save();
        $this->assertSame(404, $this->request('/' . $child->get_id())->get_status());
    }

    public function test_configured_public_urls_and_unsafe_link_rejection(): void
    {
        $product = $this->product('Public token preview');
        \Kizlo\Modules\Settings\Site\SiteSettings::load()->setUrl('https://shop.example')->save();
        \Kizlo\Modules\Settings\PostType\PostTypeSettings::load('product')->setData(['pathname_structure' => '/catalog/{{slug}}'])->save('product');
        $url = $this->request('/' . $product->get_id())->get_data()['url'];
        $this->assertSame('https://shop.example/catalog/public-token-preview/', $url);
        foreach (['/wp-admin/{{slug}}', '/catalog/{{slug}}?preview=true', '/catalog/{{slug}}?_wpnonce=secret'] as $path) {
            \Kizlo\Modules\Settings\PostType\PostTypeSettings::load('product')->setData(['pathname_structure' => $path])->save('product');
            $this->assertNull($this->request('/' . $product->get_id())->get_data()['url']);
        }
    }

    public function test_exact_sku_and_barcode_collisions_do_not_choose_a_product(): void
    {
        $sku = $this->product('SKU match', 'publish', '0012345678905');
        $barcode = $this->product('Barcode match');
        $barcode->set_global_unique_id('0012345678905');
        $barcode->save();
        $response = $this->request('', ['search' => '0012345678905'])->get_data();
        $this->assertSame([$sku->get_id(), $barcode->get_id()], array_column($response['items'], 'id'));
        $this->assertSame(2, $response['total']);
    }

    public function test_display_prices_follow_tax_currency_and_precision_settings(): void
    {
        update_option('woocommerce_calc_taxes', 'yes');
        update_option('woocommerce_tax_based_on', 'base');
        update_option('woocommerce_prices_include_tax', 'no');
        update_option('woocommerce_tax_display_shop', 'incl');
        update_option('woocommerce_currency', 'INR');
        update_option('woocommerce_currency_pos', 'right_space');
        update_option('woocommerce_price_num_decimals', 3);
        \WC_Tax::_insert_tax_rate(['tax_rate_country' => '', 'tax_rate_state' => '', 'tax_rate' => '10', 'tax_rate_name' => 'Tax', 'tax_rate_priority' => 1, 'tax_rate_compound' => 0, 'tax_rate_shipping' => 0, 'tax_rate_order' => 0, 'tax_rate_class' => '']);
        $product = $this->product('Taxed price');
        $data = $this->request('/' . $product->get_id())->get_data();
        $this->assertStringContainsString('11.000', $data['price']);
        $this->assertStringContainsString('₹', $data['price']);
    }

    public function test_cookie_nonce_authentication_uses_wordpress_recovery_boundary(): void
    {
        global $wp_rest_auth_cookie, $wp_rest_application_password_uuid;
        $savedCookie = $wp_rest_auth_cookie;
        $savedPassword = $wp_rest_application_password_uuid;
        $savedServer = $_SERVER;
        $savedRequest = $_REQUEST;
        $user = get_current_user_id();
        try {
            $wp_rest_auth_cookie = true;
            $wp_rest_application_password_uuid = null;
            unset($_REQUEST['_wpnonce'], $_SERVER['HTTP_X_WP_NONCE']);
            $this->assertTrue(rest_cookie_check_errors(null));
            $this->assertSame(401, $this->request()->get_status());
            wp_set_current_user($user);
            $_SERVER['HTTP_X_WP_NONCE'] = 'expired';
            $this->assertSame('rest_cookie_invalid_nonce', rest_cookie_check_errors(null)->get_error_code());
            $_SERVER['HTTP_X_WP_NONCE'] = wp_create_nonce('wp_rest');
            $this->assertTrue(rest_cookie_check_errors(null));
            $this->assertSame(200, $this->request()->get_status());
        } finally {
            $wp_rest_auth_cookie = $savedCookie;
            $wp_rest_application_password_uuid = $savedPassword;
            $_SERVER = $savedServer;
            $_REQUEST = $savedRequest;
        }
    }
}
