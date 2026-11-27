<?php

namespace Kizlo\Modules\Auth;

use WP_Error;
use WP_REST_Request;

final class RoutePermissions
{
    public const ACCESS = ['public', 'authenticated', 'session', 'preview', 'admin'];

    public static function check(WP_REST_Request $request, string $access, ?callable $permission = null): mixed
    {
        $identity = AuthModule::identity($request);
        if ($identity instanceof WP_Error) return $identity;
        if ($access === 'admin') {
            if ($identity !== null || !is_user_logged_in()) {
                return new WP_Error('kizlo_rest_unauthorized', 'WordPress administrator authentication required.', ['status' => 401]);
            }
            if (!current_user_can('manage_options')) return new WP_Error('kizlo_rest_forbidden', 'Administrator privileges required.', ['status' => 403]);
        } elseif ($access === 'authenticated' && $identity === null && !is_user_logged_in()) {
            return new WP_Error('kizlo_rest_unauthorized', 'User authentication required.', ['status' => 401]);
        }
        if (in_array($access, ['session', 'preview'], true) && $permission === null) {
            return new WP_Error('kizlo_rest_forbidden', 'The route requires an explicit session or preview permission check.', ['status' => 403]);
        }
        return $permission !== null ? $permission($request) : true;
    }
}
