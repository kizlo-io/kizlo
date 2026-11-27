<?php

namespace Kizlo\Modules\Auth;

use Kizlo\Modules\Settings\Auth\AuthSettings;
use WP_HTTP_Response;
use WP_REST_Request;

final class BrowserAccess
{
    public function register(): void
    {
        add_action('rest_api_init', static function (): void {
            remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');
        }, PHP_INT_MAX);
        add_filter('rest_pre_serve_request', [$this, 'cors'], PHP_INT_MAX, 3);
        add_filter('rest_post_dispatch', [$this, 'privacy'], PHP_INT_MAX, 3);
    }

    public function cors(bool $served, mixed $result, WP_REST_Request $request): bool
    {
        if (!AuthModule::supportsRoute($request->get_route())) return (bool) rest_send_cors_headers($served);
        header_remove('Access-Control-Allow-Origin');
        header_remove('Access-Control-Allow-Credentials');
        header('Vary: Origin', false);
        $origin = get_http_origin();
        if ($origin && in_array($origin, AuthSettings::load()->getData()['allowed_origins'], true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
            header('Access-Control-Allow-Headers: Authorization, Content-Type, Cart-Token, Nonce, X-WP-Nonce');
            header('Access-Control-Expose-Headers: Cart-Token, Cart-Hash, Nonce, X-WP-Total, X-WP-TotalPages, X-Kizlo-Version, X-Kizlo-Extensions');
        }
        return $served;
    }

    public function privacy(mixed $response, mixed $server, WP_REST_Request $request): mixed
    {
        if (!$response instanceof WP_HTTP_Response || !AuthModule::supportsRoute($request->get_route())) return $response;
        if ($request->get_header('authorization') || $request->get_header('cart-token') || $request->get_param('preview_token')
            || $request->get_param('previewToken') || $request->get_param('password') || is_user_logged_in()
            || str_contains($request->get_route(), '/cart') || str_contains($request->get_route(), '/checkout')) {
            $response->header('Cache-Control', 'private, no-store');
            $headers = $response->get_headers();
            foreach (array_keys($headers) as $name) {
                if (in_array(strtolower($name), ['cloudflare-cdn-cache-control', 'cdn-cache-control', 'cache-tag'], true)) unset($headers[$name]);
            }
            $response->set_headers($headers);
        }
        return $response;
    }
}
