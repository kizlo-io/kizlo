<?php

namespace Kizlo\WooCommerce\Modules\Contract;

/**
 * Publishes the WooCommerce routes Kizlo consumes but does not serve.
 *
 * Registration waits for `init`, which is later than it looks like it needs to
 * be and is late for two reasons.
 *
 * The Store API's container has to exist to be asked, which it does from
 * `woocommerce_blocks_loaded` onwards, and {@see \Kizlo\WooCommerce\Modules\Product\ProductModule}
 * extends the Store API product on that same hook. Deriving from the same hook
 * meant the two ran in whatever order {@see \Kizlo\WooCommerce\Plugin} happened
 * to list its modules in, and the product spec quietly lost its
 * `extensions.kizlo` block when the list was reordered.
 *
 * The second reason is not about ordering within this plugin at all.
 * `WC_REST_Customers_Controller::get_collection_params()` builds its `role` enum
 * from `array_keys( $wp_roles->role_names )`, reading the global directly, and
 * that global does not exist during `plugins_loaded`. Asking the controller for
 * its parameters before `init` is a fatal, not a missing enum.
 *
 * Nothing depends on these landing earlier: a spec route registers no endpoint,
 * and the document is not built until something asks for `/introspect`.
 *
 * Schemas are registered before routes, so the `$ref`s the routes carry resolve
 * against something. The registry sorts this out either way, but the order says
 * what depends on what.
 */
class ContractModule
{
    public function register(): void
    {
        add_action('init', [$this, 'describe'], 20);
    }

    public function describe(): void
    {
        RestApiRoutes::registerSchemas();
        StoreApiRoutes::registerSchemas();

        RestApiRoutes::register();
        StoreApiRoutes::register();
    }
}
