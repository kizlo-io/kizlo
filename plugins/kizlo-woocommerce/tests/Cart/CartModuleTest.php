<?php

namespace Kizlo\WooCommerce\Tests\Cart;

use WC_Product_Variable;
use WC_Product_Variation;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\WooCommerce\Modules\Cart\CartModule;
use Kizlo\WooCommerce\Modules\Contract\KizloBlocks;
use Kizlo\WooCommerce\Tests\TestCase;

class CartModuleTest extends TestCase
{
    public function test_cart_item_extension_uses_base_product_identity_and_custom_fields(): void
    {
        $definitions = FieldDefinitions::normalize([[
            'type'    => 'text',
            'name'    => 'product_note',
            'default' => 'Default note',
        ]]);
        $settings = PostTypeSettings::load('product');
        $settings->setData(['custom_fields' => $definitions]);
        $settings->save('product');

        $product = new WC_Product_Variable();
        $product->set_name('Base product');
        $product->set_slug('base-product');
        $product->save();

        $variation = new WC_Product_Variation();
        $variation->set_parent_id($product->get_id());
        $variation->set_regular_price('12');
        $variation->save();

        CustomFieldsStore::write(CustomFieldsStore::META_POST, $product->get_id(), $definitions, [
            'product_note' => 'Stored on base',
        ]);

        $result = (new CartModule())->cartItemExtensionData([
            'product_id'   => $product->get_id(),
            'variation_id' => $variation->get_id(),
            'data'         => $variation,
        ]);

        $this->assertSame($product->get_id(), $result['product_id']);
        $this->assertSame($variation->get_id(), $result['variation_id']);
        $this->assertSame('base-product', $result['slug']);
        $this->assertSame(['product_note' => 'Stored on base'], (array) $result['custom']);
        $this->assertIsString($result['url']);
        $this->assertStringContainsString('base-product', $result['url']);
    }

    public function test_cart_item_extension_schema_is_closed_and_typed(): void
    {
        $properties = KizloBlocks::storeCartItem();

        $this->assertSame(['product_id', 'variation_id', 'slug', 'url', 'custom'], array_keys($properties));
        $this->assertSame('integer', $properties['product_id']['type']);
        $this->assertSame('integer', $properties['variation_id']['type']);
        $this->assertSame(['string', 'null'], $properties['url']['type']);
        $this->assertArrayNotHasKey('additionalProperties', $properties['custom']);
        $this->assertSame([], KizloBlocks::storeCart());
    }

    public function test_order_item_extension_schema_separates_product_availability(): void
    {
        $properties = KizloBlocks::storeOrderItem();

        $this->assertSame(
            ['product_id', 'variation_id', 'product_exists', 'slug', 'url', 'custom'],
            array_keys($properties),
        );
        $this->assertSame('boolean', $properties['product_exists']['type']);
        $this->assertSame(['string', 'null'], $properties['url']['type']);
        $this->assertArrayNotHasKey('additionalProperties', $properties['custom']);
    }
}
