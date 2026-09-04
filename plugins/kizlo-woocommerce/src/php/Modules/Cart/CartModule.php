<?php

namespace Kizlo\WooCommerce\Modules\Cart;

use WC_Product;
use WP_Post;
use Kizlo\Support\Utils;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\WooCommerce\Modules\Contract\KizloBlocks;
use Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema;
use Automattic\WooCommerce\StoreApi\Schemas\V1\CartItemSchema;

class CartModule
{

    public function register(): void
    {
        add_action('woocommerce_blocks_loaded', [$this, 'extendShopApiCartSchema'], PHP_INT_MAX);
        add_action('woocommerce_store_api_cart_errors', [CartMerger::class, 'addErrors']);
    }

    public function extendShopApiCartSchema()
    {
        woocommerce_store_api_register_endpoint_data([
            'namespace'       => 'kizlo',
            'endpoint'        => CartSchema::IDENTIFIER,
            'data_callback'   => [$this, 'cartExtensionData'],
            'schema_callback' => [KizloBlocks::class, 'storeCart'],
            'schema_type'     => ARRAY_A,
        ]);

        woocommerce_store_api_register_endpoint_data([
            'namespace'       => 'kizlo',
            'endpoint'        => CartItemSchema::IDENTIFIER,
            'data_callback'   => [$this, 'cartItemExtensionData'],
            'schema_callback' => [KizloBlocks::class, 'storeCartItem'],
            'schema_type'     => ARRAY_A,
        ]);
    }

    /** @return array<string, mixed> */
    public function cartExtensionData(): array
    {
        return [];
    }

    /**
     * Kizlo-owned data attached to a Store API cart item.
     *
     * Product identity and managed fields always come from the base product.
     * WooCommerce's native cart item `id` points at the variation for variation
     * lines, so it cannot supply that distinction itself.
     *
     * @param array<string, mixed> $cart_item
     * @return array<string, mixed>
     */
    public function cartItemExtensionData(array $cart_item): array
    {
        $product_id   = (int) ($cart_item['product_id'] ?? 0);
        $variation_id = (int) ($cart_item['variation_id'] ?? 0);
        $product      = wc_get_product($product_id);
        $settings     = PostTypeSettings::load('product');
        $post         = $product instanceof WC_Product ? get_post($product->get_id()) : null;

        return [
            'product_id'   => $product_id,
            'variation_id' => $variation_id,
            'slug'         => $product instanceof WC_Product ? $product->get_slug() : '',
            'url'          => $post instanceof WP_Post
                ? Utils::getSettings()->resolvePostUrl($post, $settings)
                : null,
            'custom'       => (object) CustomFieldsStore::read(
                CustomFieldsStore::META_POST,
                $product_id,
                $settings->getCustomFields(),
            ),
        ];
    }
}
