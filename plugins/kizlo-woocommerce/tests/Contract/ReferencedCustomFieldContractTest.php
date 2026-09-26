<?php

namespace Kizlo\WooCommerce\Tests\Contract;

use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\Introspection\ManagedContent;
use Kizlo\Modules\Introspection\Registry;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\WooCommerce\Modules\Contract\ContractModule;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;
use Kizlo\WooCommerce\Modules\Product\ProductModule;
use Kizlo\WooCommerce\Tests\TestCase;

/**
 * Product media fields survive the complete WooCommerce contract derivation.
 */
class ReferencedCustomFieldContractTest extends TestCase
{
    public function test_media_custom_fields_publish_the_complete_contract_without_exclusions(): void
    {
        $settings = PostTypeSettings::load('product');
        $settings->setData([
            'custom_fields' => FieldDefinitions::normalize([
                ['type' => 'image', 'name' => 'qa_image', 'required' => true],
                ['type' => 'file', 'name' => 'qa_file', 'required' => true],
            ]),
        ]);
        $settings->save('product');

        (new ProductModule())->extendStoreApiProductSchema();
        WooCommerceSchemas::register();
        (new ContractModule())->describe();
        $this->bootRestServer();

        ManagedContent::flush();
        $document = Registry::build();
        $schemas  = $document['schemas'];

        $this->assertArrayHasKey(
            'woocommerce.products',
            $schemas,
            wp_json_encode($document['diagnostics'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        );
        $this->assertArrayHasKey(
            'woocommerce.store.products',
            $schemas,
            wp_json_encode($document['diagnostics'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        );

        $rest = $schemas['woocommerce.products']['properties']['kizlo']['properties']['custom']['properties'];
        $store = $schemas['woocommerce.store.products']['properties']['extensions']['properties']['kizlo']['properties']['custom']['properties'];

        foreach ([$rest, $store] as $custom) {
            $this->assertSame('kizlo.media-image', $custom['qa_image']['$ref']);
            $this->assertSame('kizlo.media', $custom['qa_file']['$ref']);
        }

        $this->assertSame(
            ['create', 'delete', 'list', 'retrieve', 'update'],
            $this->operations($document['apis']['woocommerce.products']),
        );
        $this->assertSame(
            ['list', 'retrieve', 'retrieve_by_slug'],
            $this->operations($document['apis']['woocommerce.store.products']),
        );

        $cart = $schemas['woocommerce.store.cart']['properties'];
        $this->assertArrayHasKey('items', $cart);
        $this->assertArrayHasKey('cross_sells', $cart);
        $this->assertSame([], array_values(array_filter(
            $document['diagnostics'],
            static fn(array $entry): bool => $entry['type'] === 'error',
        )), 'Strict generation must have no excluded contributions.');
    }

    /**
     * @param array<string, mixed> $api
     * @return array<int, string>
     */
    private function operations(array $api): array
    {
        $operations = [];

        foreach ($api['paths'] as $path) {
            $operations = array_merge($operations, array_keys($path));
        }

        sort($operations, SORT_STRING);

        return $operations;
    }
}
