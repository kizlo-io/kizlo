<?php

namespace Kizlo\Modules\Seo;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Utils;
use Kizlo\Modules\Introspection\CoreSchemas;
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
            'id'        => 'seo.robots',
            'operation' => 'retrieve',
            'method'    => 'GET',
            'route'     => '/seo/robots',
            'summary'   => 'Retrieve the robots.txt directives',
            'input'     => ['type' => 'object'],
            'responses' => [
                '200' => ['description' => 'The directives to render.', 'body' => ['$ref' => SeoSchemas::ROBOTS]],
            ],
            'callback'  => [$this, 'getRobots'],
        ]);

        kizlo_register_route([
            'id'        => 'seo.homepage',
            'operation' => 'retrieve',
            'method'    => 'GET',
            'route'     => '/seo/homepage',
            'summary'   => 'Retrieve the homepage SEO',
            'input'     => ['type' => 'object'],
            'responses' => [
                '200' => ['description' => 'Head metadata and JSON-LD for the homepage.', 'body' => ['$ref' => CoreSchemas::SEO]],
            ],
            'callback'  => [$this, 'getHomepage'],
        ]);

        kizlo_register_route([
            'id'        => 'seo.sitemaps',
            'operation' => 'list',
            'method'    => 'GET',
            'route'     => '/seo/sitemaps',
            'summary'   => 'List the sitemap collections',
            'input'     => ['type' => 'object'],
            'responses' => [
                '200' => [
                    'description' => 'One entry per indexable collection.',
                    'body'        => ['type' => 'array', 'items' => ['$ref' => SeoSchemas::SITEMAP]],
                ],
            ],
            'callback'  => [$this, 'getSitemaps'],
        ]);

        kizlo_register_route([
            'id'        => 'seo.sitemaps',
            'operation' => 'list_urls',
            'method'    => 'GET',
            'route'     => kizlo_route('/seo/sitemaps/:type/:key'),
            'summary'   => 'List one collection page of URLs',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'type' => ['type' => 'string', 'required' => true, 'enum' => ['post_type', 'taxonomy']],
                    'key'  => ['type' => 'string', 'required' => true, 'description' => 'Post type or taxonomy slug.'],
                    'page' => ['type' => 'integer', 'default' => 1, 'minimum' => 1],
                ],
            ],
            'responses' => [
                '200' => [
                    'description' => 'The URLs on this page of the collection.',
                    'body'        => ['type' => 'array', 'items' => ['$ref' => SeoSchemas::SITEMAP_URL]],
                ],
                '400' => ['description' => 'Unknown content type.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => [$this, 'getSitemapsUrls'],
        ]);

        kizlo_register_route([
            'id'        => 'seo.sitemaps',
            'operation' => 'retrieve',
            'method'    => 'GET',
            'route'     => kizlo_route('/seo/sitemaps/:type'),
            'summary'   => 'Retrieve the index, or a collection that has no key',

            // The two content types that need no key, and the only route whose
            // body depends on which one was asked for: `index` answers the index
            // payload, `author` answers URLs the way the keyed route does.
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'type' => ['type' => 'string', 'required' => true, 'enum' => ['index', 'author']],
                    'page' => ['type' => 'integer', 'default' => 1, 'minimum' => 1, 'description' => 'Applies to "author" only.'],
                ],
            ],
            'responses' => [
                '200' => [
                    'description' => 'The sitemap index, or a page of author URLs.',
                    'body'        => [
                        'anyOf' => [
                            ['$ref' => SeoSchemas::SITEMAP_INDEX],
                            ['type' => 'array', 'items' => ['$ref' => SeoSchemas::SITEMAP_URL]],
                        ],
                    ],
                ],
                '400' => ['description' => 'Unknown content type.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => [$this, 'getSitemapsUrls'],
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
