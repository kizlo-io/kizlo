<?php

namespace Kizlo\Pos\Support;

final class Lock
{
    public static function run(string $key, callable $operation): mixed
    {
        global $wpdb;
        $name = 'kizlo_pos_' . substr(hash('sha256', $wpdb->prefix . ':' . $key), 0, 48);
        if ((string) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 5)', $name)) !== '1') {
            throw new \RuntimeException('This operation is busy. Check its status before retrying.');
        }
        try { return $operation(); }
        finally { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $name)); }
    }
}
