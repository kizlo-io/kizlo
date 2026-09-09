<?php

namespace Kizlo\WooCommerce\Tests\Product;

use WP_Post;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\WooCommerce\Modules\Contract\KizloBlocks;
use Kizlo\Support\Utils;
use Kizlo\WooCommerce\Modules\Product\ProductModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_DateTime;
use WC_Product_Simple;

class ProductModuleTest extends TestCase
{
    protected function tearDown(): void
    {
        remove_all_filters('kizlo_post_type_custom_values');

        parent::tearDown();
    }

    public function test_store_sale_dates_are_qualified_utc_values(): void
    {
        $product = new WC_Product_Simple();
        $product->set_date_on_sale_from(new WC_DateTime('2026-01-02T03:04:05+05:30'));
        $product->set_date_on_sale_to(new WC_DateTime('2026-02-03T04:05:06-08:00'));

        $result = (new ProductModule())->storeProductExtensionData($product);

        $this->assertSame('2026-01-01T21:34:05Z', $result['on_sale_from']);
        $this->assertSame('2026-02-03T12:05:06Z', $result['on_sale_to']);
    }

    public function test_missing_store_sale_dates_stay_null(): void
    {
        $result = (new ProductModule())->storeProductExtensionData(new WC_Product_Simple());

        $this->assertNull($result['on_sale_from']);
        $this->assertNull($result['on_sale_to']);
    }

    public function test_store_products_expose_grouped_custom_values_and_their_exact_schema(): void
    {
        $definitions = FieldDefinitions::normalize([[
            'type'    => 'text',
            'name'    => 'product_note',
            'default' => 'Default note',
        ]]);
        $settings = PostTypeSettings::load('product');
        $settings->setData(['custom_fields' => $definitions]);
        $settings->save('product');

        $product = new WC_Product_Simple();
        $product->set_name('Custom product');
        $product->set_regular_price('10');
        $product->save();

        CustomFieldsStore::write(CustomFieldsStore::META_POST, $product->get_id(), $definitions, [
            'product_note' => 'Stored note',
        ]);

        $result = (new ProductModule())->storeProductExtensionData($product);
        $schema = KizloBlocks::storeProduct()['custom'];

        $this->assertSame(['product_note' => 'Stored note'], (array) $result['custom']);
        $this->assertSame('string', $schema['properties']['product_note']['type']);
        $this->assertTrue($schema['properties']['product_note']['required']);
        $this->assertArrayNotHasKey('additionalProperties', $schema);
    }

    public function test_rest_products_apply_the_post_type_custom_values_filter(): void
    {
        $definitions = FieldDefinitions::normalize([[
            'type'    => 'text',
            'name'    => 'product_note',
            'default' => 'Default note',
        ]]);
        $settings = PostTypeSettings::load('product');
        $settings->setData(['custom_fields' => $definitions]);
        $settings->save('product');

        $product = new WC_Product_Simple();
        $product->set_name('Filtered product');
        $product->set_regular_price('10');
        $product->save();

        CustomFieldsStore::write(CustomFieldsStore::META_POST, $product->get_id(), $definitions, [
            'product_note' => 'Stored note',
        ]);

        $received = [];
        add_filter('kizlo_post_type_custom_values', function (array $custom, WP_Post $post) use (&$received): array {
            $received[]    = ['custom' => $custom, 'post' => $post];
            $custom['integration'] = ['label' => 'Integration value'];

            return $custom;
        }, 10, 2);

        $result = (new ProductModule())->extendProduct([], $product);
        $custom = (array) $result['kizlo']['custom'];

        $this->assertSame('Stored note', $custom['product_note']);
        $this->assertSame(['label' => 'Integration value'], $custom['integration']);
        $this->assertNotEmpty($received);
        foreach ($received as $call) {
            $this->assertSame(['product_note' => 'Stored note'], $call['custom']);
            $this->assertSame($product->get_id(), $call['post']->ID);
        }
    }

    public function test_store_product_contexts_apply_the_post_type_custom_values_filter(): void
    {
        $definitions = FieldDefinitions::normalize([[
            'type'    => 'text',
            'name'    => 'product_note',
            'default' => 'Default note',
        ]]);
        $settings = PostTypeSettings::load('product');
        $settings->setData(['custom_fields' => $definitions]);
        $settings->save('product');

        $product = new WC_Product_Simple();
        $product->set_name('Store product');
        $product->set_regular_price('10');
        $product->save();

        CustomFieldsStore::write(CustomFieldsStore::META_POST, $product->get_id(), $definitions, [
            'product_note' => 'Stored note',
        ]);

        $received = [];
        add_filter('kizlo_post_type_custom_values', function (array $custom, WP_Post $post) use (&$received): array {
            $received[]    = ['custom' => $custom, 'post' => $post];
            $custom['integration'] = ['label' => 'Integration value'];

            return $custom;
        }, 10, 2);

        $module    = new ProductModule();
        $extension = $module->storeProductExtensionData($product);
        $detail    = $module->extendStoreProductDetail([], $product);

        foreach ([$extension['custom'], $detail['extensions']['kizlo']['custom']] as $value) {
            $custom = (array) $value;
            $this->assertSame('Stored note', $custom['product_note']);
            $this->assertSame(['label' => 'Integration value'], $custom['integration']);
        }

        $this->assertCount(2, $received);
        foreach ($received as $call) {
            $this->assertSame(['product_note' => 'Stored note'], $call['custom']);
            $this->assertSame($product->get_id(), $call['post']->ID);
        }
    }

    public function test_detail_enrichment_preserves_third_party_extensions_without_store_url_fallbacks(): void
    {
        $filter_calls = 0;
        add_filter('kizlo_post_type_custom_values', function (array $custom) use (&$filter_calls): array {
            $filter_calls++;

            return $custom;
        });

        $module = new ProductModule();
        $result = $module->extendStoreProductDetail(
            [
                'extensions' => (object) [
                    'acme' => (object) ['retained' => true],
                ],
            ],
            new WC_Product_Simple(),
        );

        $this->assertTrue($result['extensions']['acme']->retained);
        $this->assertNull($result['extensions']['kizlo']['url']);
        $this->assertSame([], (array) $result['extensions']['kizlo']['custom']);
        $this->assertArrayNotHasKey('hs_code', $result['extensions']['kizlo']);
        $this->assertArrayNotHasKey('extend', $result['extensions']['kizlo']);
        $this->assertSame(0, $filter_calls);
    }

    public function test_store_extension_resolves_headless_relationship_urls(): void
    {
        $term_id = self::factory()->term->create([
            'taxonomy' => 'product_cat',
            'name'     => 'Plans',
            'slug'     => 'plans',
        ]);

        $product = new WC_Product_Simple();
        $product->set_name('Subscription');
        $product->set_regular_price('10');
        $product->save();
        wp_set_object_terms($product->get_id(), [$term_id], 'product_cat');

        $module = new ProductModule();
        $result = $module->storeProductExtensionData($product);
        $term   = get_term($term_id, 'product_cat');

        $this->assertInstanceOf(\WP_Term::class, $term);

        $settings = Utils::getSettings();
        $expected = $settings->resolveTermUrl($term, $settings->taxonomies->get('product_cat'));
        $urls     = array_column($result['term_urls'], null, 'taxonomy');

        $this->assertSame($expected, $urls['product_cat']['url']);
        $this->assertSame($term_id, $urls['product_cat']['id']);
        $this->assertArrayNotHasKey('hs_code', $result);
        $this->assertArrayNotHasKey('extend', $result);
    }
}
