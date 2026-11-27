<?php

namespace Kizlo\Modules\Auth;

use Kizlo\Modules\Settings\Auth\AuthSettings;
use Kizlo\Modules\Settings\Auth\AuthSettingsService;
use Kizlo\Modules\CoreApi\RouteDiscovery;
use Throwable;
use WP_Error;
use WP_REST_Request;

final class AuthModule
{
    public function register(): void
    {
        (new AuthSettingsService())->register();
        (new BrowserAccess())->register();
        add_filter('rest_pre_dispatch', [$this, 'validateSuppliedToken'], 0, 3);
        add_filter(RouteDiscovery::ROUTE_FILTER, [$this, 'describePublicReads'], 5, 4);
    }

    public function validateSuppliedToken(mixed $result, mixed $server, WP_REST_Request $request): mixed
    {
        if (is_wp_error($result) || !self::supportsRoute($request->get_route())) return $result;
        if ($request->get_header('x-wp-nonce') && is_user_logged_in()
            && preg_match('/^Bearer /i', (string) $request->get_header('authorization'))) return self::unauthorized();
        $identity = self::identity($request);
        return $identity instanceof WP_Error ? $identity : $result;
    }

    public static function supportsRoute(string $route): bool
    {
        return str_starts_with($route, '/kizlo/v1/') || str_starts_with($route, '/wc/store/') || str_starts_with($route, '/wp/v2/');
    }

    /** @param array<string, mixed>|null $declaration @return array<string, mixed>|null */
    public function describePublicReads(?array $declaration, string $namespace, string $route, string $method): ?array
    {
        if ($declaration === null || $namespace !== 'wp/v2' || $method !== 'GET') return $declaration;
        $segments = explode('/', trim($route, '/'));
        if (count($segments) > 2 || !in_array($declaration['operation'] ?? '', ['list', 'retrieve'], true)) return $declaration;
        $resources = ['media', 'comments'];
        foreach (get_post_types(['public' => true, 'show_in_rest' => true], 'objects') as $type) $resources[] = $type->rest_base ?: $type->name;
        foreach (get_taxonomies(['public' => true, 'show_in_rest' => true], 'objects') as $taxonomy) $resources[] = $taxonomy->rest_base ?: $taxonomy->name;
        if (in_array($segments[0], $resources, true)) $declaration['access'] = 'public';
        return $declaration;
    }

    /** An absent token is a guest; an invalid supplied token is always an error. */
    public static function identity(WP_REST_Request $request): Identity|WP_Error|null
    {
        $authorization = $request->get_header('authorization');
        if ($authorization === null || $authorization === '' || str_starts_with(strtolower($authorization), 'basic ')) return null;
        if (!preg_match('/^Bearer ([A-Za-z0-9_.-]+)$/iD', $authorization, $matches)) return self::unauthorized();
        try {
            $config = AuthConfiguration::normalize(AuthSettings::load()->getData());
            if ($config['provider'] === 'disabled') return self::unauthorized();
            return JwtVerifier::verify($matches[1], $config, KeyStore::forToken($matches[1], $config));
        } catch (KeyUnavailable $error) {
            return new WP_Error('kizlo_auth_unavailable', 'Authentication is temporarily unavailable.', ['status' => 503]);
        } catch (Throwable $error) {
            return self::unauthorized();
        }
    }

    private static function unauthorized(): WP_Error
    {
        return new WP_Error('kizlo_invalid_token', 'The supplied session token is missing, expired, or invalid.', ['status' => 401]);
    }
}
