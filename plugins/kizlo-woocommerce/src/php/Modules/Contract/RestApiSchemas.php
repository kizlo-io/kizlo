<?php

namespace Kizlo\WooCommerce\Modules\Contract;

use WC_REST_Products_Controller;
use WP_REST_Controller;

/**
 * What a `wc/v3` response gains after its controller built it.
 *
 * WooCommerce's admin REST controllers are `WP_REST_Controller`s, so discovery
 * reads their responses from `get_item_schema()` without help. Two things it
 * cannot see: what this plugin adds afterwards, because
 * `woocommerce_rest_prepare_product_object` is a response filter and no schema
 * WooCommerce publishes mentions the block it attaches; and what a batch route
 * takes, because that is published by a method of its own.
 */
final class RestApiSchemas
{
    /**
     * The request shape WooCommerce publishes for a batch route, by API ID.
     *
     * `get_public_batch_schema()` is the only place the `{create, update,
     * delete}` shape is written down, and only a controller can be asked for it.
     * This filter is handed one and {@see RouteCorrections} is not, so the
     * answer is kept here for it. Rebuilt on every document build, because this
     * filter runs on every document build.
     *
     * @var array<string, array<string, array<string, mixed>>>
     */
    private static array $batches = [];

    /**
     * For `kizlo_introspection_core_schema`.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    public static function contribute(
        array $properties,
        string $apiId,
        WP_REST_Controller $controller,
        string $operation,
        string $path,
    ): array {
        // Every product this controller prepares runs through
        // `woocommerce_rest_prepare_product_object`, whichever route asked for
        // it, so the block belongs on the duplicate, the related list and the
        // batch as much as on `/products` itself. Keyed by the controller rather
        // than the API ID for exactly that reason. Variations are a controller
        // of their own and a filter of their own, and are left alone.
        if ($controller instanceof WC_REST_Products_Controller) {
            $properties['kizlo'] = KizloBlocks::restProduct();
        }

        if (str_ends_with($path, RouteCorrections::BATCH)) {
            self::remember($apiId, $controller);
        }

        return $properties;
    }

    /**
     * @return array<string, array<string, mixed>>|null
     */
    public static function batch(string $apiId): ?array
    {
        return self::$batches[$apiId] ?? null;
    }

    private static function remember(string $apiId, WP_REST_Controller $controller): void
    {
        // A controller that publishes no batch schema loses the correction, not
        // its route: the batch stays described as the registration reads.
        if (!method_exists($controller, 'get_public_batch_schema')) {
            return;
        }

        $schema = $controller->get_public_batch_schema();

        if (!is_array($schema) || !is_array($schema['properties'] ?? null)) {
            return;
        }

        self::$batches[$apiId] = kizlo_translate_spec_properties($schema['properties'], $apiId . '.batch');
    }
}
