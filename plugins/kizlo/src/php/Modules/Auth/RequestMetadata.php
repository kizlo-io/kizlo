<?php

namespace Kizlo\Modules\Auth;

final class RequestMetadata
{
    public static function ip(): string
    {
        // A deployment may resolve its known proxy here; arbitrary forwarding headers are never trusted.
        $ip = apply_filters('kizlo_client_ip', $_SERVER['REMOTE_ADDR'] ?? '');
        return is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '';
    }
}
