<?php


namespace Kizlo\WooCommerce\Modules\Customer;

use WP_User;

class CustomerRepository
{
    public function extendCustomer(array $data, WP_User $user): array
    {
        $data['kizlo'] = array_merge([
            'description' => $user->description,
            'display_name' => $user->display_name,
            'locale' => $user->locale,
            'nickname' => $user->nickname,
        ], kizlo_apply_extend_filter('customer', $user));
        return $data;
    }
}
