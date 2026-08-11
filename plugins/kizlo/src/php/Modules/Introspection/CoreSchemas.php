<?php

namespace Kizlo\Modules\Introspection;

use WP_REST_Posts_Controller;

/**
 * The base schemas everything else extends or references.
 *
 * These describe what the API actually returns today, so they are derived from
 * the code that builds those responses — {@see \Kizlo\Modules\Post\PostSchema},
 * `kizlo_ensure_media_data()`, {@see \Kizlo\Modules\PostType\PostTypeApi} and
 * {@see \Kizlo\Modules\Taxonomy\TaxonomyApi} — rather than designed against the
 * WordPress documentation.
 *
 * `kizlo.post` and `kizlo.term` carry only the fields present for every managed
 * type. Anything that depends on a post type's supports, a taxonomy's hierarchy
 * or configured custom fields is added per type by {@see ManagedContent}.
 */
class CoreSchemas
{
    public const ERROR  = 'kizlo.error';
    public const MEDIA  = 'kizlo.media';
    public const POST   = 'kizlo.post';
    public const TERM   = 'kizlo.term';
    public const SEO    = 'kizlo.seo';

    /** A status a post can be read back as. */
    public const POST_STATUS = 'kizlo.post-status';

    /** A status a post can be written with. */
    public const POST_STATUS_WRITABLE = 'kizlo.post-status-writable';

    /** A status a list can be filtered by. */
    public const POST_STATUS_FILTER = 'kizlo.post-status-filter';

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        $status = self::statusVocabularies();

        return [
            self::ERROR                => self::error(),
            self::MEDIA                => self::media(),
            self::POST                 => self::post(),
            self::TERM                 => self::term(),
            self::SEO                  => self::seo(),
            self::POST_STATUS          => self::postStatus($status['filter']),
            self::POST_STATUS_WRITABLE => self::postStatusWritable($status['writable']),
            self::POST_STATUS_FILTER   => self::postStatusFilter($status['filter']),
        ];
    }

    /**
     * The status vocabularies, read from the controller rather than rebuilt.
     *
     * Core declares two of them and they are the only source worth having:
     * `get_item_schema()` carries the statuses a post may be written with, and
     * `get_collection_params()` carries the ones a list may be filtered by.
     * Calling `get_post_stati()` here with a guess at the right flags would put
     * Kizlo back to deciding what core has already decided, which is the
     * hand-written fork {@see CoreCollectionParams} exists to end. Both are taken
     * verbatim, plugin-registered statuses included.
     *
     * Both are global. `register_post_status()` takes no post type, and every
     * managed type reports the same two enums, which {@see \Kizlo\Tests\Introspection\PostStatusTest}
     * pins so that a plugin filtering one type's schema cannot go unnoticed.
     *
     * @return array{writable: array<int, string>, filter: array<int, string>}
     */
    private static function statusVocabularies(): array
    {
        // Not memoized: WP_REST_Posts_Controller caches its own schema, so a
        // status registered after the first call would never reach a later build.
        $controller = new WP_REST_Posts_Controller('post');

        return [
            'writable' => $controller->get_item_schema()['properties']['status']['enum'],
            'filter'   => $controller->get_collection_params()['status']['items']['enum'],
        ];
    }

    /**
     * The one vocabulary core does not declare, and the one thing Kizlo decides.
     *
     * Core reuses its item schema for the response, and that enum is wrong for
     * the job: it excludes `trash` and `inherit`, but the delete route returns a
     * trashed entry on every call and every attachment reads back as `inherit`.
     * Adopting it would publish a contract Kizlo's own routes break constantly.
     *
     * So it is the filter vocabulary less `any`, which is a query verb rather
     * than a status: no post is ever stored with it. That keeps the derivation on
     * core's numbers and leaves exactly one token to justify.
     *
     * @param array<int, string> $filter
     * @return array<string, mixed>
     */
    private static function postStatus(array $filter): array
    {
        return [
            'type'        => 'string',
            'description' => 'A status a post can be read back as, including internal ones such as "trash" and "inherit" that no write accepts.',
            'enum'        => array_values(array_diff($filter, ['any'])),
        ];
    }

    /**
     * @param array<int, string> $writable
     * @return array<string, mixed>
     */
    private static function postStatusWritable(array $writable): array
    {
        return [
            'type'        => 'string',
            'description' => 'A status a post can be created or updated with.',
            'enum'        => $writable,
        ];
    }

    /**
     * @param array<int, string> $filter
     * @return array<string, mixed>
     */
    private static function postStatusFilter(array $filter): array
    {
        return [
            'type'        => 'string',
            'description' => 'A status a list can be filtered by. "any" matches every status.',
            'enum'        => $filter,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function error(): array
    {
        return [
            'type'        => 'object',
            'description' => 'The WordPress REST error envelope returned for every failed request.',
            'properties'  => [
                'code'    => ['type' => 'string', 'required' => true, 'description' => 'Machine-readable error code.'],
                'message' => ['type' => 'string', 'required' => true],
                'data'    => [
                    'type'                 => 'object',
                    'required'             => true,
                    'properties'           => [
                        'status' => ['type' => 'integer', 'required' => true],
                    ],
                    'additionalProperties' => true,
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function media(): array
    {
        return [
            'type'        => 'object',
            'description' => 'A resolved attachment, as returned wherever Kizlo expands a media reference.',
            'properties'  => [
                'id'       => ['type' => 'integer', 'required' => true],
                'name'     => ['type' => 'string', 'required' => true],
                'alt'      => ['type' => 'string', 'required' => true],
                'src'      => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                'mime'     => ['type' => 'string', 'required' => true],
                'width'    => ['type' => 'integer', 'description' => 'Absent for attachments without image metadata.'],
                'height'   => ['type' => 'integer', 'description' => 'Absent for attachments without image metadata.'],
                'variants' => [
                    'type'        => 'array',
                    'description' => 'One entry per registered image size.',
                    'items'       => [
                        'type'       => 'object',
                        'properties' => [
                            'src'    => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                            'width'  => ['type' => 'integer', 'required' => true],
                            'height' => ['type' => 'integer', 'required' => true],
                        ],
                    ],
                ],
                'srcset'   => ['type' => 'string'],
            ],
        ];
    }

    /**
     * The WordPress post fields present on every managed post type, in every
     * context. Supports-dependent fields are added per type.
     *
     * @return array<string, mixed>
     */
    private static function post(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Fields every Kizlo-managed post type returns, independent of its supports.',
            'properties'  => [
                'id'           => ['type' => 'integer', 'required' => true],
                'date'         => ['type' => 'string', 'required' => true, 'nullable' => true, 'format' => 'date-time', 'description' => "The post's publication date in the site's timezone."],
                'date_gmt'     => ['type' => 'string', 'required' => true, 'nullable' => true, 'format' => 'date-time'],
                'guid'         => [
                    'type'       => 'object',
                    'required'   => true,
                    'properties' => [
                        'rendered' => ['type' => 'string', 'required' => true],
                    ],
                ],
                'modified'     => ['type' => 'string', 'required' => true, 'format' => 'date-time'],
                'modified_gmt' => ['type' => 'string', 'required' => true, 'format' => 'date-time'],
                'slug'         => ['type' => 'string', 'required' => true],
                'status'       => ['$ref' => self::POST_STATUS, 'required' => true],
                'type'         => ['type' => 'string', 'required' => true],
                'link'         => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                'template'     => ['type' => 'string', 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function term(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Fields every Kizlo-managed taxonomy returns. Hierarchical taxonomies add "parent".',
            'properties'  => [
                'id'          => ['type' => 'integer', 'required' => true],
                'count'       => ['type' => 'integer', 'required' => true],
                'description' => ['type' => 'string', 'required' => true],
                'link'        => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                'name'        => ['type' => 'string', 'required' => true],
                'slug'        => ['type' => 'string', 'required' => true],
                'taxonomy'    => ['type' => 'string', 'required' => true],
                'meta'        => ['type' => 'object', 'required' => true, 'additionalProperties' => true],
            ],
        ];
    }

    /**
     * The resolved SEO block carried on single post and term responses.
     *
     * @return array<string, mixed>
     */
    private static function seo(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Head metadata and JSON-LD resolved from the Kizlo SEO settings and any per-item overrides.',
            'properties'  => [
                'head'   => [
                    'type'       => 'object',
                    'required'   => true,
                    'properties' => [
                        'title'     => ['type' => 'string', 'required' => true],
                        'canonical' => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                        'robots'    => [
                            'type'       => 'object',
                            'required'   => true,
                            'properties' => [
                                'index'             => ['type' => 'string', 'required' => true, 'enum' => ['index', 'noindex']],
                                'follow'            => ['type' => 'string', 'required' => true, 'enum' => ['follow', 'nofollow']],
                                'max-snippet'       => ['type' => 'string', 'required' => true],
                                'max-image-preview' => ['type' => 'string', 'required' => true],
                                'max-video-preview' => ['type' => 'string', 'required' => true],
                            ],
                        ],
                        'og'        => [
                            'type'       => 'object',
                            'required'   => true,
                            'properties' => [
                                'locale'      => ['type' => 'string', 'required' => true],
                                'type'        => ['type' => 'string', 'required' => true],
                                'title'       => ['type' => 'string', 'required' => true],
                                'url'         => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                                'site_name'   => ['type' => 'string', 'required' => true],
                                'description' => ['type' => 'string', 'description' => 'Absent when no description resolves.'],
                                'image'       => self::seoImage(),
                            ],
                        ],
                        'twitter'   => [
                            'type'       => 'object',
                            'required'   => true,
                            'properties' => [
                                'card'        => ['type' => 'string', 'required' => true, 'enum' => ['summary', 'summary_large_image']],
                                'title'       => ['type' => 'string', 'required' => true],
                                'site'        => ['type' => 'string', 'required' => true, 'nullable' => true, 'description' => 'The configured X/Twitter handle, or null when none is set.'],
                                'creator'     => ['type' => 'string', 'required' => true, 'nullable' => true],
                                'description' => ['type' => 'string'],
                                'image'       => ['type' => 'string', 'format' => 'uri'],
                                'image_alt'   => ['type' => 'string'],
                            ],
                        ],
                        'article'   => [
                            'type'        => 'object',
                            'required'    => true,
                            'nullable'    => true,
                            'description' => 'Null unless the item resolves to a schema.org Article type. Each field is present only when it resolves.',
                            'properties'  => [
                                'published_time' => ['type' => 'string', 'format' => 'date-time'],
                                'modified_time'  => ['type' => 'string', 'format' => 'date-time'],
                                'author'         => ['type' => 'string'],
                                'author_url'     => ['type' => 'string', 'format' => 'uri'],
                                'section'        => ['type' => 'string'],
                                'tags'           => ['type' => 'array', 'items' => ['type' => 'string']],
                            ],
                        ],
                    ],
                ],
                'schema' => [
                    'type'        => 'object',
                    'required'    => true,
                    'description' => 'JSON-LD graph.',
                    'properties'  => [
                        '@context' => ['type' => 'string', 'required' => true],
                        '@graph'   => [
                            'type'     => 'array',
                            'required' => true,
                            'items'    => ['type' => 'object', 'additionalProperties' => true],
                        ],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function seoImage(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Absent when no image resolves.',
            'properties'  => [
                'url'    => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                'width'  => ['type' => 'integer', 'required' => true, 'nullable' => true],
                'height' => ['type' => 'integer', 'required' => true, 'nullable' => true],
                'type'   => ['type' => 'string', 'required' => true, 'nullable' => true],
                'alt'    => ['type' => 'string', 'required' => true, 'nullable' => true],
            ],
        ];
    }
}
