<?php

namespace Kizlo\WooCommerce\Tests;

use WP_REST_Server;
use WP_UnitTestCase;

abstract class TestCase extends WP_UnitTestCase
{
    /**
     * Build the REST server and let every plugin register its routes.
     *
     * Route discovery answers nothing until the route table is complete, which
     * it learns from `rest_api_init` finishing. A test that builds the document
     * without this gets an empty contract rather than a failure, so anything
     * asserting on described routes has to boot first.
     */
    protected function bootRestServer(): void
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();

        do_action('rest_api_init', $wp_rest_server);
    }
}
