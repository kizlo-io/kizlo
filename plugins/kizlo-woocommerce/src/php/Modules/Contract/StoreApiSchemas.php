<?php

namespace Kizlo\WooCommerce\Modules\Contract;

use Automattic\WooCommerce\StoreApi\Routes\V1\AbstractRoute;
use Automattic\WooCommerce\StoreApi\SchemaController;
use Automattic\WooCommerce\StoreApi\StoreApi;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;
use Throwable;

/**
 * The shapes `wc/store/v1` answers with, read off the routes that serve them.
 *
 * Kizlo used to hand-declare seventeen Store API operations here. Discovery
 * describes every registered one instead, so what is left is the half discovery
 * cannot do alone: reading a response shape out of a route object that is not a
 * `WP_REST_Controller`.
 *
 * ## How a Store API route answers for itself
 *
 * `AbstractRoute` publishes `get_item_schema()`, which returns the whole schema
 * its `AbstractSchema` describes, properties and all. It also carries that
 * schema's `title`, which is its `IDENTIFIER` — `cart`, `product`, `checkout` —
 * and that is what the corrections below key off. No route-to-schema table is
 * kept anywhere: a route added tomorrow answers the same question the same way,
 * and simply gets no correction if none applies to its shape.
 *
 * ## What still has to be corrected
 *
 * WooCommerce publishes some shapes narrower than it returns them, and Kizlo adds
 * fields through response filters that have no schema half at all. Both are
 * merged back in here. A correction never decides whether a route is described:
 * an unrecognised identifier keeps its derived shape and nothing else changes.
 */
final class StoreApiSchemas
{
    private const NAMESPACE = WooCommerceNamespaces::STORE;

    /**
     * The generated schema ID the cart shape lands under.
     *
     * Discovery names a schema after the first API to claim its shape, and it
     * walks shortest path first, so `/cart` names the cart before any of the
     * `/cart/*` mutations that answer with the same body. Referenced by name
     * because the checkout carries a whole cart that WooCommerce does not declare.
     */
    private const CART_SCHEMA = WooCommerceNamespaces::STORE_PREFIX . '.cart';

    /**
     * Arguments cart handlers require even though WooCommerce marks them optional.
     *
     * Keyed by path now rather than by route identifier, because the path is what
     * the route filter is given. Kept as a named map so the PHPUnit suite can
     * compare every entry against the route WooCommerce currently registers, which
     * is the alarm for an upstream rename.
     *
     * @var array<string, array<int, string>>
     */
    public const REQUIRED_ARGUMENTS = [
        '/cart/add-item'      => ['id'],
        '/cart/update-item'   => ['key', 'quantity'],
        '/cart/remove-item'   => ['key'],
        '/cart/apply-coupon'  => ['code'],
        '/cart/remove-coupon' => ['code'],
    ];

    /**
     * The embed-context product, which nothing serves on its own.
     *
     * A recommendation collection carries products as WordPress renders them for
     * an embed, which is a narrower shape than the route returns. No route
     * answers with it, so no derivation reaches it and it is registered here.
     */
    public static function registerSchemas(): void
    {
        kizlo_register_route_schema(
            WooCommerceSchemas::STORE_PRODUCT_SUMMARY,
            static fn(): array => self::summary(),
        );
    }

    /** @return array<string, mixed> */
    private static function summary(): array
    {
        $schemas = self::schemas();

        $properties = $schemas === null
            ? null
            : self::properties($schemas, 'product', WooCommerceSchemas::STORE_PRODUCT_SUMMARY, 'embed');

        if ($properties === null) {
            throw new \RuntimeException('The WooCommerce Store API product schema is unavailable.');
        }

        return [
            'type'        => 'object',
            'description' => 'A Store API product filtered to the fields WooCommerce exposes in embed context.',
            'properties'  => self::normalizeProductProperties($properties),
        ];
    }

    /**
     * The response shape for a Store API route, for `kizlo_introspection_core_response`.
     *
     * Returns the incoming value untouched for anything that is not a Store API
     * route, so discovery falls through to its own opaque description rather than
     * getting a shape this plugin had no business inventing.
     */
    public static function contribute(mixed $properties, ?object $subject, string $namespace, string $route, string $operation): mixed
    {
        if ($namespace !== self::NAMESPACE || !$subject instanceof AbstractRoute) {
            return $properties;
        }

        $schema = $subject->get_item_schema();

        if (!is_array($schema['properties'] ?? null)) {
            return $properties;
        }

        $identifier = is_string($schema['title'] ?? null) ? $schema['title'] : '';

        $derived = kizlo_translate_spec_properties(
            $schema['properties'],
            sprintf('%s %s', $namespace, $route),
            context: 'view',
            required: true,
        );

        return self::corrected($derived, $identifier);
    }

    /**
     * WooCommerce's shape, widened to what it actually returns.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function corrected(array $properties, string $identifier): array
    {
        return match ($identifier) {
            'product'                    => self::productProperties($properties),
            'cart'                       => self::normalizeCartProperties($properties),
            'order'                      => self::orderProperties($properties),
            'checkout', 'checkout-order' => self::checkoutProperties($properties, $identifier),
            'product-collection-data'    => self::collectionDataProperties($properties),
            default                      => $properties,
        };
    }

    /**
     * A product may carry the fixed recommendation collections this integration
     * embeds. WordPress adds them through the embed transport, so no schema
     * WooCommerce publishes mentions them.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function productProperties(array $properties): array
    {
        $properties = self::normalizeProductProperties($properties);

        $relations = [];
        foreach (['upsells', 'cross_sells', 'related'] as $relation) {
            $relations[$relation] = [
                'type'        => 'array',
                'description' => sprintf('Embedded %s product collections. WordPress wraps each collection once.', str_replace('_', ' ', $relation)),
                'items'       => [
                    'type'  => 'array',
                    'items' => ['$ref' => WooCommerceSchemas::STORE_PRODUCT_SUMMARY],
                ],
            ];
        }

        $properties['_embedded'] = [
            'type'        => 'object',
            'description' => 'Recommendation collections included by the WordPress embed transport.',
            'properties'  => $relations,
        ];

        return $properties;
    }

    /**
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function orderProperties(array $properties): array
    {
        $schemas = self::schemas();

        // The fee shape is its own Store API schema, so a WooCommerce release
        // that drops it costs the order its fees rather than its whole shape.
        return $schemas === null ? $properties : self::normalizeOrderProperties($schemas, $properties);
    }

    /**
     * Both checkout responses carry the whole cart, and `get_properties()` does
     * not mention it: `CheckoutSchema` writes `__experimentalCart` in
     * `get_item_response()` and `get_draft_response()` only. Null on the order
     * response when the order has no cart behind it.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function checkoutProperties(array $properties, string $identifier): array
    {
        $properties = self::normalizeCheckoutProperties($properties, $identifier);

        $properties['__experimentalCart'] = [
            '$ref'        => self::CART_SCHEMA,
            'required'    => true,
            'nullable'    => true,
            'description' => 'The cart the checkout was built from. Returned but undeclared by WooCommerce, so it is named here.',
        ];

        return $properties;
    }

    /**
     * Collection data carries a `kizlo` block added by a route interceptor, which
     * is a response filter and has no schema half for the derivation to find.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function collectionDataProperties(array $properties): array
    {
        $properties['kizlo'] = KizloBlocks::collectionData();

        return $properties;
    }

    // ============================================================
    // CORRECTIONS
    // ============================================================

    /**
     * Correct Store API response shapes WooCommerce's schema describes too narrowly.
     *
     * Custom attributes and unselected variation attributes return null, while
     * third-party Store extensions may add namespaces beside Kizlo's.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function normalizeProductProperties(array $properties): array
    {
        self::correct($properties, ['attributes', 'items', 'properties', 'taxonomy', 'nullable'], true);
        self::correct($properties, ['variations', 'items', 'properties', 'attributes', 'items', 'properties', 'value', 'nullable'], true);
        self::correct($properties, ['extensions', 'additionalProperties'], true);

        return $properties;
    }

    /**
     * Write a correction only where there is something to correct.
     *
     * PHP creates every missing level on assignment, so a blind write into a
     * shape WooCommerce has renamed does not fail: it invents the property it
     * meant to fix, and the contract publishes a field nobody serves. A
     * correction that finds nothing has to do nothing, which is what lets an
     * upstream rename cost one field rather than the whole description.
     *
     * The last name in the path is the key being written, so every level above
     * it has to exist already.
     *
     * @param array<string, mixed> $properties
     * @param array<int, string>   $path
     */
    private static function correct(array &$properties, array $path, mixed $value): void
    {
        $key    = (string) array_pop($path);
        $cursor = &$properties;

        foreach ($path as $step) {
            if (!is_array($cursor[$step] ?? null)) {
                unset($cursor);

                return;
            }

            $cursor = &$cursor[$step];
        }

        $cursor[$key] = $value;

        unset($cursor);
    }

    /**
     * Correct Store API cart shapes whose executable response is wider than the
     * schema WooCommerce publishes.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function normalizeCartProperties(array $properties): array
    {
        $fee = $properties['fees']['items']['properties'] ?? null;

        if (is_array($fee) && isset($fee['id'])) {
            $fee['key'] = $fee['id'];
            $fee['key']['description'] = 'Runtime identifier for the fee within the cart.';
            unset($fee['id']);
            $properties['fees']['items']['properties'] = $fee;
        }

        self::correct($properties, ['payment_methods', 'items'], ['type' => 'string']);
        self::correct($properties, ['payment_requirements', 'items'], ['type' => 'string']);
        self::correct($properties, ['extensions', 'additionalProperties'], true);
        self::correct($properties, ['items', 'items', 'properties', 'item_data', 'items', 'properties', 'display', 'nullable'], true);

        // WooCommerce's ItemSchema describes extensions with its inherited
        // ProductSchema identifier, while CartItemSchema serializes them with
        // its own cart-item identifier. Replace the described Product block
        // with the Cart Item block the runtime actually returns.
        self::correct($properties, ['items', 'items', 'properties', 'extensions', 'properties'], kizlo_translate_spec_properties([
            'kizlo' => [
                'description' => 'Extension data registered by kizlo',
                'type'        => ['object', 'null'],
                'properties'  => KizloBlocks::storeCartItem(),
            ],
        ], WooCommerceSchemas::STORE_CART . '.items.extensions', required: true));
        self::correct($properties, ['items', 'items', 'properties', 'extensions', 'additionalProperties'], true);

        $address_value = ['anyOf' => [['type' => 'string'], ['type' => 'boolean']]];
        self::correct($properties, ['billing_address', 'additionalProperties'], $address_value);
        self::correct($properties, ['shipping_address', 'additionalProperties'], $address_value);

        return $properties;
    }

    /**
     * Correct the Store API order schema to match its executable response.
     *
     * WooCommerce 11.0.1 emits fees without declaring them, returns numeric fee
     * keys, omits the declared item type, and does not emit the item extensions
     * inherited from ProductSchema. OrderModule supplies the runtime extension
     * data; this method describes that repaired response.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function normalizeOrderProperties(SchemaController $schemas, array $properties): array
    {
        $fee = self::properties($schemas, 'order-fee', WooCommerceSchemas::STORE_ORDER . '.fees') ?? [];
        if (isset($fee['id'])) {
            $fee['key'] = $fee['id'];
            $fee['key']['type'] = 'integer';
            $fee['key']['description'] = 'Runtime WooCommerce order-item ID for the fee.';
            unset($fee['id']);
        }

        $properties['fees'] = [
            'type'        => 'array',
            'required'    => true,
            'description' => 'Fees applied to the order. Returned by WooCommerce but absent from OrderSchema::get_properties().',
            'items'       => [
                'type'       => 'object',
                'properties' => $fee,
            ],
        ];

        self::correct($properties, ['payment_requirements', 'items'], ['type' => 'string']);

        $item = $properties['items']['items']['properties'] ?? null;

        if (is_array($item)) {
            unset($item['type']);
            $properties['items']['items']['properties'] = $item;

            self::correct($properties, ['items', 'items', 'properties', 'id', 'description'], 'The immutable WooCommerce order-item ID.');
            self::correct($properties, ['items', 'items', 'properties', 'item_data', 'items', 'properties', 'display', 'nullable'], true);

            $properties['items']['items']['properties']['extensions'] = [
                'type'                 => 'object',
                'required'             => true,
                'additionalProperties' => true,
                'description'          => 'Store API product extension namespaces for the current product behind this order line.',
                'properties'           => kizlo_translate_spec_properties([
                    'kizlo' => [
                        'description' => 'Current product enrichment registered by Kizlo.',
                        'type'        => ['object', 'null'],
                        'properties'  => KizloBlocks::storeOrderItem(),
                    ],
                ], WooCommerceSchemas::STORE_ORDER . '.items.extensions', required: true),
            ];
        }

        $address_value = ['anyOf' => [['type' => 'string'], ['type' => 'boolean']]];
        self::correct($properties, ['billing_address', 'additionalProperties'], $address_value);
        self::correct($properties, ['shipping_address', 'additionalProperties'], $address_value);

        return $properties;
    }

    /**
     * Correct checkout fields whose runtime shape is wider than the generated
     * schema, and remove the input-only account flag from response contracts.
     *
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private static function normalizeCheckoutProperties(array $properties, string $identifier): array
    {
        $scalar = ['anyOf' => [['type' => 'string'], ['type' => 'boolean']]];

        self::correct($properties, ['additional_fields', 'additionalProperties'], $scalar);
        self::correct($properties, ['billing_address', 'additionalProperties'], $scalar);
        self::correct($properties, ['shipping_address', 'additionalProperties'], $scalar);
        self::correct($properties, ['extensions', 'additionalProperties'], true);
        unset($properties['payment_method']['enum']);

        if ($identifier === 'checkout') {
            unset($properties['create_account']);
        }

        return $properties;
    }

    // ============================================================
    // DERIVATION
    // ============================================================

    /**
     * @return array<string, array<string, mixed>>|null
     */
    private static function properties(SchemaController $schemas, string $identifier, string $id, string $context = 'view'): ?array
    {
        try {
            $schema = $schemas->get($identifier);
        } catch (Throwable) {
            // A WooCommerce release that drops or renames a schema should cost
            // the operations that use it and nothing else, so this is reported
            // rather than thrown.
            return null;
        }

        return kizlo_translate_spec_properties(
            $schema->get_properties(),
            $id,
            context: $context,
            required: true,
        );
    }

    // ============================================================
    // WOOCOMMERCE
    // ============================================================

    private static function schemas(): ?SchemaController
    {
        $resolved = self::resolve(SchemaController::class);

        return $resolved instanceof SchemaController ? $resolved : null;
    }

    /**
     * Null rather than a fatal when the Store API is not there to ask.
     *
     * WooCommerce can be active with its blocks package absent or its container
     * not yet built. A site in that state should lose the corrections that need
     * the container, not its whole `/introspect` document.
     */
    private static function resolve(string $class): ?object
    {
        if (!class_exists(StoreApi::class)) {
            return null;
        }

        try {
            $resolved = StoreApi::container()->get($class);
        } catch (Throwable) {
            return null;
        }

        return is_object($resolved) ? $resolved : null;
    }
}
