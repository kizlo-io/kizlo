<?php

namespace Kizlo\WooCommerce\Tests\Cart;

use WC_Payment_Gateway;
use WC_Product_Variable;
use WC_Product_Variation;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\WooCommerce\Modules\Cart\CartModule;
use Kizlo\WooCommerce\Modules\Contract\KizloBlocks;
use Kizlo\WooCommerce\Tests\TestCase;

/**
 * A payment gateway with controllable availability and frontend strings, so a
 * test can hand WooCommerce a known available-gateway set.
 */
class FakePaymentGateway extends WC_Payment_Gateway
{
    private bool $available;

    public function __construct(string $id, string $title, string $description, bool $available)
    {
        $this->id          = $id;
        $this->title       = $title;
        $this->description = $description;
        $this->available   = $available;
    }

    public function is_available(): bool
    {
        return $this->available;
    }
}

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
    }

    public function test_cart_extension_lists_available_payment_gateways_in_display_order(): void
    {
        $alpha   = new FakePaymentGateway('alpha', 'Alpha Pay', 'Pay with Alpha.', true);
        $bravo   = new FakePaymentGateway('bravo', 'Bravo Bank', 'Direct bank transfer.', true);
        $charlie = new FakePaymentGateway('charlie', 'Charlie Cash', 'Unavailable gateway.', false);

        add_filter('woocommerce_payment_gateways', static fn(): array => [$alpha, $bravo, $charlie]);
        WC()->payment_gateways()->init();

        $data = (new CartModule())->cartExtensionData();

        $this->assertSame([
            ['id' => 'alpha', 'title' => 'Alpha Pay', 'description' => 'Pay with Alpha.', 'order' => 0, 'enabled' => true],
            ['id' => 'bravo', 'title' => 'Bravo Bank', 'description' => 'Direct bank transfer.', 'order' => 1, 'enabled' => true],
        ], $data['payment_methods']);
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
