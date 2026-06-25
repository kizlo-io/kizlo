<?php

/**
 * PHPStan stubs for the WooCommerce Store API internals used by kizlo-woocommerce.
 *
 * The Store API (`Automattic\WooCommerce\StoreApi\*`) ships inside the
 * WooCommerce plugin and is not part of `php-stubs/woocommerce-stubs`, so these
 * classes/functions are invisible to PHPStan. Declares only what the plugin
 * touches, with loose return types where the consuming code narrows via @var.
 * Stub only — never loaded at runtime, never shipped.
 */

namespace Automattic\WooCommerce\StoreApi {
    class Container
    {
        /** @return mixed */
        public function get(string $id) {}
    }

    class SchemaController
    {
        /** @return mixed */
        public function get(string $name) {}
    }

    class StoreApi
    {
        public static function container(): Container {}
    }
}

namespace Automattic\WooCommerce\StoreApi\Utilities {
    class CartController
    {
        public function get_cart_for_response(): \WC_Cart {}

        public function calculate_totals(): \WC_Cart {}

        /**
         * @param array<string, mixed> $request
         * @return mixed
         */
        public function add_to_cart(array $request) {}
    }
}

namespace Automattic\WooCommerce\StoreApi\Schemas\V1 {
    class CartSchema
    {
        const IDENTIFIER = 'cart';

        /**
         * @param mixed $cart
         * @return array<string, mixed>
         */
        public function get_item_response($cart): array {}
    }

    class CartItemSchema
    {
        const IDENTIFIER = 'cart-item';
    }

    class ProductSchema
    {
        const IDENTIFIER = 'product';
    }
}

namespace Automattic\WooCommerce\StoreApi\Formatters {
    class CurrencyFormatter
    {
        /**
         * @param array<string, mixed> $value
         * @return array<string, mixed>
         */
        public function format($value): array {}
    }
}

namespace {
    /** @param array<string, mixed> $config */
    function woocommerce_store_api_register_endpoint_data(array $config): void {}
}
