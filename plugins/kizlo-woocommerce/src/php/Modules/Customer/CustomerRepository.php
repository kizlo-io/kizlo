<?php


namespace Kizlo\WooCommerce\Modules\Customer;

use WP_User;
use WC_Customer;
use Kizlo\WooCommerce\Modules\Contract\AdditionalFields;

class CustomerRepository
{
    public function extendCustomer(array $data, WP_User $user): array
    {
        $customer = new WC_Customer($user->ID);
        $data['billing']['additional_fields'] = (object) AdditionalFields::values($customer, 'billing');
        $data['shipping']['additional_fields'] = (object) AdditionalFields::values($customer, 'shipping');
        $data['additional_fields'] = (object) AdditionalFields::values($customer, 'other');

        $data['kizlo'] = array_merge([
            'description' => $user->description,
            'display_name' => $user->display_name,
            'locale' => $user->locale,
            'nickname' => $user->nickname,
        ], kizlo_apply_extend_filter('customer', $user));
        return $data;
    }
}
