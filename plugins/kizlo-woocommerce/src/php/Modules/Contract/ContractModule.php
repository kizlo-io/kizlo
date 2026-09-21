<?php

namespace Kizlo\WooCommerce\Modules\Contract;

/**
 * Puts both WooCommerce REST namespaces into the contract.
 *
 * This module used to register a written catalogue: two `wc/v3` resources and a
 * literal seventeen Store API operations. It registers nothing now. It opts the
 * two namespaces into route-table discovery and answers the questions discovery
 * cannot answer on its own, so every path and method WooCommerce serves is
 * described, including the ones nobody here has heard of.
 *
 * ## Why these four filters
 *
 * The namespace filter is the opt-in. The prefix filter is what stops `wc/v3`
 * and `wc/store/v1` both claiming `products`, since an API ID is the path's
 * literal segments and the two namespaces share them. The response filter is how
 * a Store API `AbstractRoute` gets read at all, because it is not a
 * `WP_REST_Controller` and discovery cannot reach its shape unaided. The route
 * and schema filters carry the handful of corrections upstream metadata misses.
 *
 * The filter names are written out rather than referenced through
 * `RouteDiscovery`'s constants. This is a separate plugin, and these are Kizlo's
 * published extension points: an integration hooking them has the names, not the
 * class.
 *
 * ## Why `init`, still
 *
 * Nothing here asks WooCommerce anything at registration time any more, but two
 * of the callbacks do when they run, and they run at document build. The Store
 * API container has to exist to be asked, and
 * `WC_REST_Customers_Controller::get_collection_params()` reads the `$wp_roles`
 * global, which does not exist before `init`. Registering the filters early is
 * harmless; firing them early would not be.
 */
class ContractModule
{
    public function register(): void
    {
        add_action('init', [$this, 'describe'], 20);
    }

    public function describe(): void
    {
        StoreApiSchemas::registerSchemas();

        add_filter('kizlo_introspection_core_namespaces', [WooCommerceNamespaces::class, 'describe']);
        add_filter('kizlo_introspection_core_api_prefix', [WooCommerceNamespaces::class, 'prefix'], 10, 2);
        add_filter('kizlo_introspection_core_response', [StoreApiSchemas::class, 'contribute'], 10, 5);
        add_filter('kizlo_introspection_core_route', [RouteCorrections::class, 'apply'], 10, 4);
        add_filter('kizlo_introspection_core_schema', [RestApiSchemas::class, 'contribute'], 10, 5);

        // Not a Kizlo filter: this completes WooCommerce's own registration so
        // the argument is describable in the first place.
        add_filter('rest_endpoints', [RouteCorrections::class, 'completeArguments']);
    }
}
