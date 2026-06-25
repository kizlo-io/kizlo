<?php

namespace Kizlo\WooCommerce\Modules\Customer;

use WP_User;
use WP_Error;
use WP_REST_Response;
use Kizlo\WooCommerce\Modules\Customer\CustomerRepository;

class CustomerModule
{
    private CustomerRepository $customer;

    public function __construct()
    {
        $this->customer = new CustomerRepository();
    }

    public function register(): void
    {
        add_filter('woocommerce_rest_prepare_customer', [$this, 'prepareCustomerCallback'], PHP_INT_MAX, 2);
    }


    public function prepareCustomerCallback(WP_REST_Response | WP_Error $response, WP_User $customer): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        $response->set_data($this->customer->extendCustomer($response->get_data(), $customer));

        return $response;
    }
}
