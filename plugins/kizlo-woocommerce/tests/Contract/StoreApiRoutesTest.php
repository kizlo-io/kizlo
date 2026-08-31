<?php

namespace Kizlo\WooCommerce\Tests\Contract;

use Automattic\WooCommerce\StoreApi\Routes\V1\AbstractRoute;
use Automattic\WooCommerce\StoreApi\RoutesController;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Kizlo\WooCommerce\Modules\Contract\KizloBlocks;
use Kizlo\WooCommerce\Modules\Contract\StoreApiRoutes;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;
use Kizlo\WooCommerce\Tests\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * The Store API contract stays attached to the WooCommerce routes it derives.
 */
class StoreApiRoutesTest extends TestCase
{
    public function test_the_suite_boots_with_woocommerce_and_its_store_api(): void
    {
        $this->assertTrue(defined('KIZLO_WOOCOMMERCE_VERSION'));
        $this->assertTrue(class_exists(\WooCommerce::class));
        $this->assertTrue(class_exists(StoreApi::class));
        $this->assertInstanceOf(RoutesController::class, $this->routes());
    }

    public function test_every_derived_operation_matches_a_registered_woocommerce_route(): void
    {
        $registered = rest_get_server()->get_routes();
        $derived    = $this->declarations();

        $this->assertCount(17, $derived);

        foreach ($derived as $operation) {
            $path = sprintf('/%s%s', $operation['namespace'], $operation['route']);

            $this->assertArrayHasKey($path, $registered, sprintf('%s has no registered route.', $operation['operation']));
            $this->assertTrue(
                $this->routeAccepts($registered[$path], $operation['method']),
                sprintf('%s does not accept %s.', $path, $operation['method']),
            );
        }
    }

    public function test_product_detail_operations_are_fixed_routes_without_a_public_embed_input(): void
    {
        $operations = array_slice($this->declarations(), 0, 2);

        $this->assertSame(['get_by_id', 'get_by_slug'], array_column($operations, 'operation'));

        foreach ($operations as $operation) {
            $this->assertArrayNotHasKey('_embed', $operation['input']['properties']);
            $this->assertSame(
                'woocommerce.store.product-detail',
                $operation['responses']['200']['body']['$ref'],
            );
        }
    }

    public function test_product_collection_operations_publish_every_fixed_woocommerce_argument(): void
    {
        $operations = array_slice($this->declarations(), 2, 2);
        $identifiers = ['products', 'product-collection-data'];

        foreach ($operations as $index => $operation) {
            $route = $this->routes()->get($identifiers[$index]);

            $this->assertInstanceOf(AbstractRoute::class, $route);

            $expected = $this->handlerArguments($route, 'GET');
            unset($expected['context']);

            $this->assertSame(
                array_keys($expected),
                array_keys($operation['input']['properties']),
                sprintf('%s dropped a fixed WooCommerce argument.', $operation['operation']),
            );
            $this->assertArrayHasKey('date_column', $operation['input']['properties']);
        }

        $this->assertArrayNotHasKey('_embed', $operations[0]['input']['properties']);
        $this->assertSame(
            'woocommerce.store.product-detail',
            $operations[0]['responses']['200']['body']['items']['$ref'],
        );
    }

    public function test_product_summary_is_embed_context_and_detail_adds_recommendations(): void
    {
        $summary = $this->routeSchema('woocommerce.store.product-summary');
        $detail  = $this->routeSchema('woocommerce.store.product-detail');

        $this->assertArrayHasKey('id', $summary['properties']);
        $this->assertArrayHasKey('extensions', $summary['properties']);
        $this->assertArrayNotHasKey('weight', $summary['properties']);
        $this->assertTrue($summary['properties']['extensions']['additionalProperties']);
        $this->assertTrue($summary['properties']['attributes']['items']['properties']['taxonomy']['nullable']);
        $this->assertTrue(
            $summary['properties']['variations']['items']['properties']['attributes']['items']['properties']['value']['nullable'],
        );

        $this->assertSame('woocommerce.store.product', $detail['$extends']);
        $relations = $detail['properties']['_embedded']['properties'];
        $this->assertSame(['upsells', 'cross_sells', 'related'], array_keys($relations));

        foreach ($relations as $relation) {
            $this->assertSame(
                'woocommerce.store.product-summary',
                $relation['items']['items']['$ref'],
            );
        }
    }

    public function test_store_product_extension_contains_only_kizlo_owned_product_data(): void
    {
        $properties = KizloBlocks::storeProduct();

        $this->assertSame(['string', 'null'], $properties['url']['type']);
        $this->assertArrayHasKey('term_urls', $properties);
        $this->assertArrayHasKey('custom', $properties);
        $this->assertArrayNotHasKey('custom_fields', $properties);
        $this->assertArrayNotHasKey('hs_code', $properties);
        $this->assertArrayNotHasKey('extend', $properties);
    }

    public function test_cart_contract_matches_runtime_fee_payment_extension_and_address_shapes(): void
    {
        $cart = $this->routeSchema('woocommerce.store.cart')['properties'];

        $fee = $cart['fees']['items']['properties'];
        $this->assertArrayHasKey('key', $fee);
        $this->assertArrayNotHasKey('id', $fee);
        $this->assertSame('string', $cart['payment_methods']['items']['type']);
        $this->assertSame('string', $cart['payment_requirements']['items']['type']);
        $this->assertTrue($cart['extensions']['additionalProperties']);
        $this->assertTrue($cart['items']['items']['properties']['item_data']['items']['properties']['display']['nullable']);

        $item_extensions = $cart['items']['items']['properties']['extensions'];
        $this->assertTrue($item_extensions['additionalProperties']);
        $this->assertSame(
            ['product_id', 'variation_id', 'slug', 'url', 'custom'],
            array_keys($item_extensions['properties']['kizlo']['properties']),
        );

        $scalar = ['anyOf' => [['type' => 'string'], ['type' => 'boolean']]];
        $this->assertSame($scalar, $cart['billing_address']['additionalProperties']);
        $this->assertSame($scalar, $cart['shipping_address']['additionalProperties']);
    }

    public function test_cart_customer_update_addresses_are_partial_open_objects(): void
    {
        $operation = array_values(array_filter(
            $this->declarations(),
            static fn(array $operation): bool => $operation['operation'] === 'update_customer',
        ))[0];

        foreach (['billing_address', 'shipping_address'] as $name) {
            $address = $operation['input']['properties'][$name];

            $this->assertSame(['anyOf' => [['type' => 'string'], ['type' => 'boolean']]], $address['additionalProperties']);
            foreach ($address['properties'] as $property) {
                $this->assertArrayNotHasKey('required', $property);
            }
        }
    }

    public function test_order_contract_repairs_runtime_fields_and_declares_the_customer_route(): void
    {
        $operation = array_values(array_filter(
            $this->declarations(),
            static fn(array $operation): bool => $operation['id'] === StoreApiRoutes::ORDERS_API_ID,
        ))[0];

        $this->assertSame('get', $operation['operation']);
        $this->assertSame('GET', $operation['method']);
        $this->assertSame(['id', 'key', 'billing_email'], array_keys($operation['input']['properties']));
        $this->assertTrue($operation['input']['properties']['id']['required']);
        $this->assertArrayNotHasKey('context', $operation['input']['properties']);
        $this->assertSame('woocommerce.store.order', $operation['responses']['200']['body']['$ref']);

        $order = $this->routeSchema(WooCommerceSchemas::STORE_ORDER)['properties'];
        $this->assertArrayHasKey('fees', $order);
        $this->assertSame('string', $order['payment_requirements']['items']['type']);

        $fee = $order['fees']['items']['properties'];
        $this->assertSame('integer', $fee['key']['type']);
        $this->assertArrayNotHasKey('id', $fee);

        $item = $order['items']['items']['properties'];
        $this->assertArrayNotHasKey('type', $item);
        $this->assertSame('integer', $item['id']['type']);
        $this->assertTrue($item['item_data']['items']['properties']['display']['nullable']);
        $this->assertTrue($item['extensions']['additionalProperties']);
        $this->assertSame(
            ['product_id', 'variation_id', 'product_exists', 'slug', 'url', 'custom'],
            array_keys($item['extensions']['properties']['kizlo']['properties']),
        );

        $scalar = ['anyOf' => [['type' => 'string'], ['type' => 'boolean']]];
        $this->assertSame($scalar, $order['billing_address']['additionalProperties']);
        $this->assertSame($scalar, $order['shipping_address']['additionalProperties']);
    }

    public function test_merged_cart_schema_extends_the_store_cart(): void
    {
        $method = new ReflectionMethod(WooCommerceSchemas::class, 'cart');
        $method->setAccessible(true);
        $cart = $method->invoke(null);

        $this->assertSame('woocommerce.store.cart', $cart['$extends']);
        $this->assertArrayNotHasKey('additionalProperties', $cart);
        $this->assertSame(['guest_token', 'user_id'], array_keys($cart['properties']));
    }

    public function test_every_required_overlay_argument_still_exists_upstream(): void
    {
        $reflection = new ReflectionClass(StoreApiRoutes::class);
        $overlays   = $reflection->getReflectionConstant('REQUIRED_ARGUMENTS')->getValue();

        foreach ($overlays as $identifier => $names) {
            $route = $this->routes()->get($identifier);

            $this->assertInstanceOf(AbstractRoute::class, $route);

            $arguments = $this->handlerArguments($route, 'POST');

            foreach ($names as $name) {
                $this->assertArrayHasKey(
                    $name,
                    $arguments,
                    sprintf('The %s overlay names an argument WooCommerce no longer registers.', $identifier),
                );
            }
        }
    }

    public function test_collection_taxonomy_images_use_the_shared_image_schema(): void
    {
        $image = KizloBlocks::collectionData()['properties']['taxonomy_counts']['items']['properties']['image'];

        $this->assertSame('kizlo.media-image', $image['$ref']);
        $this->assertTrue($image['nullable']);
        $this->assertArrayNotHasKey('thumbnail', KizloBlocks::collectionData()['properties']['taxonomy_counts']['items']['properties']);
    }

    private function routes(): RoutesController
    {
        $routes = StoreApi::container()->get(RoutesController::class);

        $this->assertInstanceOf(RoutesController::class, $routes);

        return $routes;
    }

    /** @return array<int, array<string, mixed>> */
    private function declarations(): array
    {
        $method = new ReflectionMethod(StoreApiRoutes::class, 'declarations');

        return $method->invoke(null, $this->routes());
    }

    /** @return array<string, mixed> */
    private function routeSchema(string $id): array
    {
        $method = new ReflectionMethod(StoreApiRoutes::class, 'routeSchema');

        return $method->invoke(null, $id);
    }

    /**
     * @param array<int, array<string, mixed>> $handlers
     */
    private function routeAccepts(array $handlers, string $method): bool
    {
        foreach ($handlers as $handler) {
            if (($handler['methods'][$method] ?? false) === true) {
                return true;
            }
        }

        return false;
    }

    /** @return array<string, array<string, mixed>> */
    private function handlerArguments(AbstractRoute $route, string $method): array
    {
        foreach ($route->get_args() as $handler) {
            if (!is_array($handler) || !is_array($handler['args'] ?? null)) {
                continue;
            }

            $methods = is_array($handler['methods'] ?? null)
                ? $handler['methods']
                : explode(',', (string) ($handler['methods'] ?? ''));

            if (in_array($method, array_map(static fn(string $name): string => strtoupper(trim($name)), $methods), true)) {
                return $handler['args'];
            }
        }

        return [];
    }
}
