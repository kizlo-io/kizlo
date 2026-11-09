<?php

namespace Kizlo\Pos\Support;

use WP_Error;

final class Permissions
{
    public static function access(): true|WP_Error
    {
        if (!is_user_logged_in()) {
            return new WP_Error('kizlo_pos_login_required', 'Sign in to WordPress to open POS.', ['status' => 401]);
        }

        if (!current_user_can('manage_woocommerce')) {
            return new WP_Error('kizlo_pos_forbidden', 'You do not have permission to use Kizlo POS.', ['status' => 403]);
        }

        return true;
    }
}
