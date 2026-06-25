<?php

namespace Kizlo\Modules\User;

use WP_User;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

class UserExtension
{
    public function register(): void
    {
        add_filter('rest_prepare_user', [$this, 'prepare'], PHP_INT_MAX, 3);
    }

    public function prepare(WP_REST_Response | WP_Error $response, WP_User $user, WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;
        $is_single = !empty($request->get_param('id') ?? $request->get_param('field'));

        if ($is_single) {
            $response->set_data($this->extendSingle($response->get_data(), $user));
        } else {
            $response->set_data($this->extendListItem($response->get_data(), $user));
        }

        return $response;
    }

    public function extendSingle(array $data, WP_User $user): array
    {
        $data['kizlo'] = array_merge([], kizlo_apply_extend_filter('user', $user));
        return $data;
    }

    public function extendListItem(array $data, WP_User $user): array
    {
        $data['kizlo'] = array_merge([],  kizlo_apply_extend_filter('user_list_item', $user));

        return $data;
    }
}
