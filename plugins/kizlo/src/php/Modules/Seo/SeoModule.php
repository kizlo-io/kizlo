<?php

namespace Kizlo\Modules\Seo;

use Throwable;
use WP_Error;
use WP_Post;
use WP_Term;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Utils;
use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Introspection\ManagedWrite;
use Kizlo\Modules\Post\PostSchema;
use Kizlo\Modules\Settings\Settings;

class SeoModule
{
    public function register()
    {
        $this->registerRoutes();
        $this->registerWrites();

        (new SeoMetaBox())->register();
        (new TermSeoMetaBox())->register();
    }

    /**
     * Accept SEO overrides under the Kizlo create/update endpoints' `kizlo.seo`
     * object, the same path the resolved block is read back from.
     *
     * The `/post-types/*` and `/taxonomies/*` routes delegate to the core
     * WordPress REST controllers, so the payload is handled exactly the way
     * {@see \Kizlo\Modules\CustomFields\CustomFieldsModule} handles `kizlo.custom`:
     *
     *  1. validated on the route's own `validate_callback` — a rejected payload
     *     blocks the write with a clean 400 before anything is created, and
     *  2. written in `rest_after_insert_{type}` once the post/term exists.
     *
     * The override keys are never registered with `show_in_rest`, so the native
     * `meta` object stays untouched and the internal key names stay off the
     * contract. {@see SeoOverridesStore}
     */
    private function registerWrites(): void
    {
        add_filter('kizlo_validate_managed_write', [$this, 'validateWrite'], 10, 3);

        // Priority 30: after Registrar::registerObjects() at 20, so the managed set is
        // complete. Reading it during boot attached these only for the objects a
        // half-built set happened to contain, so an override on any other one was
        // accepted and then dropped. The hooks serve REST requests, dispatched later.
        add_action('init', [$this, 'registerWriteHooks'], 30);
    }

    public function registerWriteHooks(): void
    {
        foreach (array_keys(Utils::getSettings()->postTypes->all()) as $post_type) {
            add_action("rest_after_insert_{$post_type}", function (WP_Post $post, WP_REST_Request $request) {
                $this->save(SeoOverridesStore::META_POST, $post->ID, $request);
            }, 10, 2);
        }

        foreach (array_keys(Utils::getSettings()->taxonomies->all()) as $taxonomy) {
            add_action("rest_after_insert_{$taxonomy}", function (WP_Term $term, WP_REST_Request $request) {
                $this->save(SeoOverridesStore::META_TERM, $term->term_id, $request);
            }, 10, 2);
        }
    }

    /**
     * Validate submitted overrides before the route callback runs, so an invalid
     * payload is rejected before the post/term is created.
     *
     * The capability deferral this check needs lives in {@see ManagedWrite}, so
     * it applies to every consumer of the filter rather than to whichever ones
     * remembered it.
     *
     * @param  bool|WP_Error $valid
     * @return bool|WP_Error
     */
    public function validateWrite($valid, ManagedWrite $write, WP_REST_Request $request)
    {
        if (is_wp_error($valid)) {
            return $valid;
        }

        try {
            $input = self::collectInput($request);
            if ($input === null) {
                return $valid;
            }

            SeoOverridesStore::assertWritable(SeoOverridesStore::fromInput(self::metaType($write), $input));
        } catch (Throwable $e) {
            return new WP_Error('kizlo_seo_invalid', $e->getMessage(), ['status' => 400]);
        }

        return $valid;
    }

    private static function metaType(ManagedWrite $write): string
    {
        return $write->family === ManagedWrite::POST_TYPE
            ? SeoOverridesStore::META_POST
            : SeoOverridesStore::META_TERM;
    }

    /**
     * Collect the submitted `kizlo.seo` group. Returns null when the request
     * carries none, so a write that never mentions SEO leaves the overrides
     * untouched.
     *
     * The malformed-envelope message matches the one
     * {@see \Kizlo\Modules\CustomFields\CustomFieldsModule::collectValues()} uses:
     * a caller who sent a broken `kizlo` object has one problem, not two.
     *
     * @return array<string, mixed>|null
     * @throws \InvalidArgumentException
     */
    private static function collectInput(WP_REST_Request $request): ?array
    {
        if (!isset($request['kizlo'])) {
            return null;
        }

        $kizlo = $request['kizlo'];
        if (!is_array($kizlo)) {
            throw new \InvalidArgumentException('The kizlo group must be an object.');
        }

        if (!isset($kizlo['seo'])) {
            return null;
        }

        $seo = $kizlo['seo'];
        if (!is_array($seo)) {
            throw new \InvalidArgumentException('The SEO group must be an object.');
        }

        return $seo;
    }

    private function save(string $meta_type, int $object_id, WP_REST_Request $request): void
    {
        $write = ManagedWrite::forRequest($request);

        // The hooks are keyed on post type and taxonomy, so they also fire for
        // core's own `/wp/v2/*` routes. Those never declare `kizlo` as an
        // argument, so neither the closed `kizlo.seo` schema nor validateWrite()
        // has seen the payload. Writing it here anyway would make core's routes a
        // second, undocumented authoring path where a misspelled field is a silent
        // no-op rather than the 400 this contract promises. {@see ManagedWrite}
        if ($write === null || self::metaType($write) !== $meta_type) {
            return;
        }

        // Already validated on the route's validate_callback; a throw here would
        // only mean the two passes disagree, so log rather than 500 after the row
        // has been created.
        try {
            $input = self::collectInput($request);
            if ($input === null) {
                return;
            }

            $values = SeoOverridesStore::fromInput($meta_type, $input);

            SeoOverridesStore::assertWritable($values);
            SeoOverridesStore::write($meta_type, $object_id, $values);
        } catch (Throwable $e) {
            kizlo_log('SEO overrides write failed: ' . $e->getMessage());
        }
    }

    public function registerRoutes()
    {
        kizlo_register_route([
            'id'        => 'kizlo.seo.robots',
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
            'id'        => 'kizlo.seo.homepage',
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
            'id'        => 'kizlo.seo.sitemaps',
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
            'id'        => 'kizlo.seo.sitemaps',
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
            'id'        => 'kizlo.seo.sitemaps',
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
