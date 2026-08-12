<?php

namespace Kizlo\Modules\Seo;

/**
 * What the SEO routes return.
 *
 * The head and JSON-LD block is not here: `kizlo.seo` already describes it,
 * because a single post and a term carry the same block {@see \Kizlo\Modules\Introspection\CoreSchemas}.
 * These are the shapes only the SEO routes produce, taken from
 * {@see SeoBase::robots()}, {@see SeoBase::sitemapIndex()} and the
 * `sitemapEntries()` on each schema class.
 */
final class SeoSchemas
{
    public const ROBOTS        = 'kizlo.robots';
    public const ROBOTS_GROUP  = 'kizlo.robots-group';
    public const SITEMAP       = 'kizlo.sitemap';
    public const SITEMAP_INDEX = 'kizlo.sitemap-index';
    public const SITEMAP_URL   = 'kizlo.sitemap-url';
    public const SITEMAP_IMAGE = 'kizlo.sitemap-image';

    /** The content a sitemap collection can be built from. */
    public const CONTENT_TYPES = ['post_type', 'taxonomy', 'author'];

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            self::ROBOTS_GROUP  => self::robotsGroup(),
            self::ROBOTS        => self::robots(),
            self::SITEMAP       => self::sitemap(),
            self::SITEMAP_INDEX => self::sitemapIndex(),
            self::SITEMAP_IMAGE => self::sitemapImage(),
            self::SITEMAP_URL   => self::sitemapUrl(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function robots(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Everything needed to render robots.txt.',
            'properties'  => [
                'rules'    => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::ROBOTS_GROUP]],
                'sitemaps' => [
                    'type'        => 'array',
                    'description' => 'The sitemap index URL, present only while the setting that includes it is on.',
                    'items'       => ['type' => 'string', 'format' => 'uri'],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function robotsGroup(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Every directive for one user agent, grouped from the configured rules.',
            'properties'  => [
                'user_agent' => ['type' => 'string', 'required' => true],
                'allow'      => ['type' => 'array', 'required' => true, 'items' => ['type' => 'string']],
                'disallow'   => ['type' => 'array', 'required' => true, 'items' => ['type' => 'string']],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function sitemap(): array
    {
        return [
            'type'        => 'object',
            'description' => 'One collection in the sitemap index.',
            'properties'  => [
                'key'     => ['type' => 'string', 'required' => true, 'description' => 'Post type or taxonomy slug, or "authors".'],
                'type'    => ['type' => 'string', 'required' => true, 'enum' => self::CONTENT_TYPES],
                'pages'   => ['type' => 'integer', 'required' => true, 'description' => 'How many pages the collection splits into.'],
                'lastmod' => ['type' => 'string', 'required' => true, 'nullable' => true, 'format' => 'date-time'],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function sitemapIndex(): array
    {
        return [
            'type'        => 'object',
            'description' => 'The sitemap index, with the origin its entries are resolved against.',
            'properties'  => [
                'origin'   => [
                    'type'        => 'string',
                    'required'    => true,
                    'format'      => 'uri',
                    'description' => 'Canonical origin from the configured site URL, so absolute URLs never fall back to the request host.',
                ],
                'sitemaps' => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::SITEMAP]],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function sitemapUrl(): array
    {
        return [
            'type'        => 'object',
            'description' => 'One URL in a sitemap collection page.',
            'properties'  => [
                'loc'     => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                'lastmod' => ['type' => 'string', 'required' => true, 'format' => 'date-time'],
                'images'  => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::SITEMAP_IMAGE]],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function sitemapImage(): array
    {
        return [
            'type'        => 'object',
            'description' => 'An image referenced by a sitemap URL.',
            'properties'  => [
                'loc'   => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                'title' => [
                    'type'        => 'string',
                    'required'    => true,
                    'nullable'    => true,
                    'description' => 'The entry title for a featured image, null for an image found in the content.',
                ],
            ],
        ];
    }
}
