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
        public function get(string $name, int $version = 1): \Automattic\WooCommerce\StoreApi\Schemas\V1\AbstractSchema {}
    }

    class RoutesController
    {
        public function get(string $name, string $version = 'v1'): \Automattic\WooCommerce\StoreApi\Routes\V1\AbstractRoute {}
    }

    class StoreApi
    {
        public static function container(): Container {}
    }
}

namespace Automattic\WooCommerce\StoreApi\Routes\V1 {
    abstract class AbstractRoute
    {
        public function get_path(): string {}

        public function set_namespace(string $namespace): void {}

        /** @return array<array-key, mixed> */
        public function get_args(): array {}
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
    abstract class AbstractSchema
    {
        /** @return array<string, mixed> */
        public function get_properties(): array {}
    }

    class CartSchema extends AbstractSchema
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

    class ProductSchema extends AbstractSchema
    {
        const IDENTIFIER = 'product';

        /**
         * @param mixed $product
         * @return array<string, mixed>
         */
        public function get_item_response($product): array {}
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
