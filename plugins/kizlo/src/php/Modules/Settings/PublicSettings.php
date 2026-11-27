<?php

namespace Kizlo\Modules\Settings;

use Kizlo\Modules\Settings\Brand\BrandSettingsService;
use Kizlo\Modules\Settings\Site\SiteSettingsService;
use Kizlo\Support\Utils;
use WP_REST_Response;

final class PublicSettings
{
    private const SITE_FIELDS = ['url', 'name', 'alternate_name', 'tagline', 'title_separator', 'fallback_image', 'search_action_structure', 'discourage_search_engines'];

    public function register(): void
    {
        kizlo_register_route_schema('kizlo.public-site', static function (): array {
            $site = SettingsSchemas::all()[SettingsSchemas::SITE];
            $site['properties'] = array_intersect_key($site['properties'], array_flip(self::SITE_FIELDS));
            return ['type' => 'object', 'properties' => [
                'site' => $site + ['required' => true],
                'brand' => ['$ref' => SettingsSchemas::BRAND, 'required' => true],
            ]];
        });
        kizlo_register_route([
            'id' => 'kizlo.site', 'operation' => 'retrieve', 'access' => 'public', 'method' => 'GET', 'route' => '/site',
            'summary' => 'Public site identity and branding', 'input' => ['type' => 'object'],
            'responses' => ['200' => ['body' => ['$ref' => 'kizlo.public-site']]],
            'callback' => [$this, 'retrieve'],
        ]);
    }

    public function retrieve(): WP_REST_Response
    {
        $settings = Utils::getSettings();
        return new WP_REST_Response([
            'site' => array_intersect_key((new SiteSettingsService())->toResponse($settings->site), array_flip(self::SITE_FIELDS)),
            'brand' => (new BrandSettingsService())->toResponse($settings->brand),
        ]);
    }
}
