<?php

namespace Kizlo\WooCommerce\Tests\Contract;

use Automattic\WooCommerce\StoreApi\Routes\V1\AbstractRoute;
use Automattic\WooCommerce\StoreApi\RoutesController;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Kizlo\WooCommerce\Modules\Contract\StoreApiRoutes;
use Kizlo\WooCommerce\Modules\Contract\KizloBlocks;
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

        $this->assertCount(14, $derived);

        foreach ($derived as $operation) {
            $path = sprintf('/%s%s', $operation['namespace'], $operation['route']);

            $this->assertArrayHasKey($path, $registered, sprintf('%s has no registered route.', $operation['operation']));
            $this->assertTrue(
                $this->routeAccepts($registered[$path], $operation['method']),
                sprintf('%s does not accept %s.', $path, $operation['method']),
            );
        }
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
