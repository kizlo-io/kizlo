<?php

namespace Kizlo\WooCommerce\Tests\Order;

use Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\WooCommerce\Modules\Order\OrderModule;
use Kizlo\WooCommerce\Tests\TestCase;
use WC_Order_Item_Product;
use WC_Product_Simple;
use WP_REST_Request;
use WP_REST_Response;

class OrderModuleTest extends TestCase
{
    public function test_order_items_emit_kizlo_and_third_party_product_extensions(): void
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
        $product->set_name('Order product');
        $product->set_slug('order-product');
        $product->set_regular_price('12');
        $product->save();

        CustomFieldsStore::write(CustomFieldsStore::META_POST, $product->get_id(), $definitions, [
            'product_note' => 'Stored product note',
        ]);

        woocommerce_store_api_register_endpoint_data([
            'namespace'       => 'order-test',
            'endpoint'        => ProductSchema::IDENTIFIER,
            'data_callback'   => static fn(): array => ['opaque' => true],
            'schema_callback' => static fn(): array => ['opaque' => ['type' => 'boolean']],
            'schema_type'     => ARRAY_A,
        ]);

        $order = wc_create_order();
        $line  = new WC_Order_Item_Product();
        $line->set_product($product);
        $line->set_quantity(1);
        $order->add_item($line);
        $order->save();

        $response = new WP_REST_Response(['items' => [['id' => $line->get_id()]]]);
        $request  = new WP_REST_Request('GET', sprintf('/wc/store/v1/order/%d', $order->get_id()));

        $result = (new OrderModule())->extendStoreOrderItems($response, null, $request);

        $this->assertInstanceOf(WP_REST_Response::class, $result);
        $extensions = $result->get_data()['items'][0]['extensions'];
        $this->assertSame(['opaque' => true], $extensions['order-test']);
        $this->assertSame($product->get_id(), $extensions['kizlo']['product_id']);
        $this->assertSame(0, $extensions['kizlo']['variation_id']);
        $this->assertTrue($extensions['kizlo']['product_exists']);
        $this->assertSame('order-product', $extensions['kizlo']['slug']);
        $this->assertSame(['product_note' => 'Stored product note'], (array) $extensions['kizlo']['custom']);
        $this->assertIsString($extensions['kizlo']['url']);
    }

    public function test_deleted_products_keep_stored_identity_without_current_enrichment(): void
    {
        $product = new WC_Product_Simple();
        $product->set_name('Disposable product');
        $product->set_regular_price('12');
        $product->save();

        $order = wc_create_order();
        $line  = new WC_Order_Item_Product();
        $line->set_product($product);
        $line->set_quantity(1);
        $order->add_item($line);
        $order->save();

        $module     = new OrderModule();
        $product_id = $product->get_id();
        $module->rememberOrderItemProductIds($line->get_id(), $line);
        $this->assertSame($product_id, (int) $line->get_meta('_kizlo_product_id', true));
        $formatted_meta_keys = array_map(
            static fn(object $meta): string => $meta->key,
            $line->get_all_formatted_meta_data(),
        );
        $this->assertNotContains('_kizlo_product_id', $formatted_meta_keys);
        $this->assertNotContains('_kizlo_variation_id', $formatted_meta_keys);
        $product->delete(true);
        $this->assertSame($product_id, (int) $line->get_meta('_kizlo_product_id', true));

        $response = new WP_REST_Response(['items' => [['id' => $line->get_id()]]]);
        $request  = new WP_REST_Request('GET', sprintf('/wc/store/v1/order/%d', $order->get_id()));

        $result = $module->extendStoreOrderItems($response, null, $request);
        $kizlo  = $result->get_data()['items'][0]['extensions']['kizlo'];

        $this->assertSame($product_id, $kizlo['product_id']);
        $this->assertFalse($kizlo['product_exists']);
        $this->assertSame('', $kizlo['slug']);
        $this->assertNull($kizlo['url']);
    }
}
