<?php

namespace Kizlo\WooCommerce\Tests\Product;

use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\WooCommerce\Modules\Contract\KizloBlocks;
use Kizlo\WooCommerce\Modules\Product\ProductModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_DateTime;
use WC_Product_Simple;

class ProductModuleTest extends TestCase
{
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
}
