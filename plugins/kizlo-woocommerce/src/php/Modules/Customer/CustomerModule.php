<?php

namespace Kizlo\WooCommerce\Modules\Customer;

use WP_User;
use WP_Error;
use WP_REST_Response;
use WP_REST_Request;
use WC_REST_Customers_Controller;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceSchemas;

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

        kizlo_register_route([
            'id'        => 'woocommerce.kizlo.customers',
            'operation' => 'retrieve',
            'access'    => 'authenticated',
            'method'    => 'GET',
            'route'     => '/woocommerce/customers',
            'summary'   => 'Resolve or create the authenticated customer',
            'input'     => ['type' => 'object'],
            'errors'    => ['kizlo_invalid_identity', 'kizlo_forbidden_identity', 'kizlo_customer_unavailable'],
            'responses' => [
                '200' => ['description' => 'The resolved customer.', 'body' => ['$ref' => 'woocommerce.customers']],
                '401' => ['description' => 'Customer identity is missing or invalid.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
                '403' => ['description' => 'This identity is protected.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
                '503' => ['description' => 'Customer resolution failed. Retry the request.', 'body' => ['$ref' => WooCommerceSchemas::ERROR]],
            ],
            'callback'  => [$this, 'retrieve'],
        ]);
    }

    public function retrieve(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $userId = CustomerResolver::forRequest($request);
        if ($userId instanceof WP_Error) return $userId;
        if ($userId === null) return new WP_Error('kizlo_invalid_identity', 'A verified customer email is required.', ['status' => 401]);

        // Select identity and response context ourselves, never from caller parameters.
        $customerRequest = new WP_REST_Request('GET');
        $customerRequest->set_param('context', 'view');

        return (new WC_REST_Customers_Controller())->prepare_item_for_response(new WP_User($userId), $customerRequest);
    }

    public function prepareCustomerCallback(WP_REST_Response | WP_Error $response, WP_User $customer): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        $response->set_data($this->customer->extendCustomer($response->get_data(), $customer));

        return $response;
    }
}
