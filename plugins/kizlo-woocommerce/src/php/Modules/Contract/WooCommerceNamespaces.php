<?php

namespace Kizlo\WooCommerce\Modules\Contract;

/**
 * The two WooCommerce REST namespaces, and what their routes are called.
 *
 * Kizlo used to hand-declare a WooCommerce contract: two `wc/v3` resources and
 * a literal seventeen Store API operations. A written list describes what
 * somebody remembered rather than what WooCommerce serves, and it goes stale on
 * the release that adds a route nobody here has heard of yet.
 *
 * So there is no list. Both namespaces are opted into the route-table discovery
 * {@see \Kizlo\Modules\CoreApi\RouteDiscovery} runs, and every registered path
 * and method in them is described, auxiliary and third-party routes included.
 *
 * ## Why a prefix is needed at all
 *
 * An API ID is every literal segment in the path, which is what makes it stable
 * and also what makes `wc/v3/products` and `wc/store/v1/products` the same name.
 * `Registry` refuses one API ID under two namespaces, so without a prefix the
 * second namespace loses its products entirely. The prefix is how each namespace
 * says which `/products` it means, and it is naming only: nothing here decides
 * whether a route is discovered.
 */
final class WooCommerceNamespaces
{
    /** The admin REST API. */
    public const REST = 'wc/v3';

    /** The public Store API. */
    public const STORE = 'wc/store/v1';

    public const REST_PREFIX = 'woocommerce';

    public const STORE_PREFIX = 'woocommerce.store';

    /**
     * @param array<int, mixed> $namespaces
     * @return array<int, mixed>
     */
    public static function describe(array $namespaces): array
    {
        return [...$namespaces, self::REST, self::STORE];
    }

    public static function prefix(mixed $prefix, string $namespace): mixed
    {
        return match ($namespace) {
            self::REST  => self::REST_PREFIX,
            self::STORE => self::STORE_PREFIX,
            default     => $prefix,
        };
    }
}
