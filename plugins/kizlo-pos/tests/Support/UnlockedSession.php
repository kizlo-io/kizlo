<?php

namespace Kizlo\Pos\Tests\Support;

use Kizlo\Pos\Modules\Security\Security;

/** Existing product and checkout tests begin after staff have verified their PIN. */
final class UnlockedSession
{
    public static function start(): void
    {
        $id = get_current_user_id();
        update_user_meta($id, Security::PIN, wp_hash_password('123456'));
        $token = \WP_Session_Tokens::get_instance($id)->create(time() + DAY_IN_SECONDS);
        $_COOKIE[LOGGED_IN_COOKIE] = wp_generate_auth_cookie($id, time() + DAY_IN_SECONDS, 'logged_in', $token);
        $request = new \WP_REST_Request('POST', '/kizlo-pos/v1/security/unlock');
        $request->set_header('Content-Type', 'application/json');
        $request->set_body(wp_json_encode(['pin' => '123456']));
        (new Security())->unlock($request);
    }
}
