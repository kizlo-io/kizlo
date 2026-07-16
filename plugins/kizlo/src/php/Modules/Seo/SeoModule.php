<?php

namespace Kizlo\Modules\Seo;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Utils;
use Kizlo\Modules\Post\PostSchema;
use Kizlo\Modules\Settings\Settings;

class SeoModule
{
    public function register()
    {
        $this->registerRoutes();

        (new SeoMetaBox())->register();
        (new TermSeoMetaBox())->register();
    }

    public function registerRoutes()
    {
        kizlo_register_route([
            'methods' => 'GET',
            'route'   => '/seo/robots',
            'callback' => [$this, 'getRobots']
        ]);

        kizlo_register_route([
            'methods' => 'GET',
            'route'   => '/seo/homepage',
            'callback' => [$this, 'getHomepage']
        ]);

        kizlo_register_route([
            'methods' => 'GET',
            'route'   => kizlo_route('/seo/sitemaps'),
            'callback' => [$this, 'getSitemaps']
        ]);

        kizlo_register_route([
            'methods' => 'GET',
            'route'   => kizlo_route('/seo/sitemaps/:type/:key'),
            'callback' => [$this, 'getSitemapsUrls']
        ]);

        kizlo_register_route([
            'methods' => 'GET',
            'route'   => kizlo_route('/seo/sitemaps/:type'),
            'callback' => [$this, 'getSitemapsUrls']
        ]);
    }

    public function getRobots(WP_REST_Request $request): WP_Error|WP_REST_Response
    {
        $settings = Utils::getSettings();
        $seo = new SeoBase($settings);
        return new WP_REST_Response($seo->robots());
    }

    public function getHomepage(WP_REST_Request $request): WP_Error|WP_REST_Response
    {
        $settings = Utils::getSettings();
        $seo = new HomeSchema($settings);

        return new WP_REST_Response([
            'head'   => $seo->buildMeta(),
            'schema' => $seo->jsonLd(),
        ]);
    }

    public function getSitemaps(WP_REST_Request $request): WP_Error|WP_REST_Response
    {
        $settings = Utils::getSettings();
        $seo = new SeoBase($settings);
        return rest_ensure_response($seo->sitemapIndex());
    }

    public function getSitemapsUrls(WP_REST_Request $request): WP_Error|WP_REST_Response
    {
        $settings = Utils::getSettings();

        $type = $request->get_param('type');
        $key = $request->get_param('key');
        $page = max(1, (int) ($request->get_param('page') ?? 1));

        return match ($type) {
            'index'  => new WP_REST_Response($this->sitemapIndexPayload($settings)),
            'post_type'  => new WP_REST_Response((new PostSchema($settings))->sitemapEntries($key, $page)),
            'taxonomy'  => new WP_REST_Response((new TermSchema($settings))->sitemapEntries($key, $page)),
            'author'  => new WP_REST_Response((new AuthorSchema($settings))->sitemapEntries($page)),
            default => new WP_REST_Response(null, 400)
        };
    }

    /**
     * The sitemap index payload: the entry list plus the canonical origin, so the frontend
     * builds absolute index `<loc>`s from the Kizlo site URL rather than the request host.
     *
     * @param  Settings $settings
     * @return array{origin: string, sitemaps: array<int, array<string, mixed>>}
     */
    private function sitemapIndexPayload(Settings $settings): array
    {
        $seo = new SeoBase($settings);

        return [
            'origin'   => $seo->siteOrigin(),
            'sitemaps' => $seo->sitemapIndex(),
        ];
    }
}
