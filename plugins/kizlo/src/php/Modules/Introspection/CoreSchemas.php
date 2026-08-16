<?php

namespace Kizlo\Modules\Introspection;

use Kizlo\Modules\Appearance\MenuSchemas;
use Kizlo\Modules\Comment\CommentSchemas;
use Kizlo\Modules\Seo\SeoSchemas;
use Kizlo\Modules\Settings\SettingsSchemas;
use Kizlo\Modules\User\UserSchemas;
use WP_REST_Posts_Controller;

/**
 * The base schemas everything else references.
 *
 * These describe what the API actually returns today, so they are derived from
 * the code that builds those responses — {@see \Kizlo\Modules\Post\PostSchema},
 * `kizlo_ensure_media_data()`, {@see \Kizlo\Modules\PostType\PostTypeApi} and
 * {@see \Kizlo\Modules\Taxonomy\TaxonomyApi} — rather than designed against the
 * WordPress documentation.
 *
 * The per-module schema classes come in through here rather than through
 * `kizlo_register_spec_schema()`, and for the same reason the rest of this class
 * exists: core schemas have to be present whenever a route's input is translated,
 * which is every REST request, while the public helper is a contribution channel
 * whose entries only exist once the contributing plugin has loaded.
 *
 * There is no shared `kizlo.post` or `kizlo.term` base any more. Both were
 * hand-listed approximations of "the fields every managed type returns", and
 * once the per-type schemas derive from the controller the only honest way to
 * keep them would be an intersection across whichever types happen to be managed
 * — which would move for everyone the moment one non-public type is enabled,
 * without any concrete type changing shape. Each managed type now carries its own
 * complete set. {@see CoreItemSchema}
 */
class CoreSchemas
{
    public const ERROR  = 'kizlo.error';
    public const MEDIA  = 'kizlo.media';
    public const SEO    = 'kizlo.seo';

    /** A status a post can be read back as. */
    public const POST_STATUS = 'kizlo.post-status';

    /** A status a post can be written with. */
    public const POST_STATUS_WRITABLE = 'kizlo.post-status-writable';

    /** A status a list can be filtered by. */
    public const POST_STATUS_FILTER = 'kizlo.post-status-filter';

    /** @var array{writable: array<int, string>, filter: array<int, string>}|null */
    private static ?array $status = null;

    /** @var array<string, array<string, mixed>>|null */
    private static ?array $all = null;

    /**
     * Memoized for the same reason the status vocabularies are, and because
     * {@see Registry::schemaMap()} asks for this once per introspected route
     * registration: every REST request builds it as many times as there are
     * routes, and the answer cannot change between two of them.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        if (self::$all !== null) {
            return self::$all;
        }

        $status = self::statusVocabularies();

        return self::$all = [
            self::ERROR                => self::error(),
            self::MEDIA                => self::media(),
            self::SEO                  => self::seo(),
            self::POST_STATUS          => self::postStatus($status['filter']),
            self::POST_STATUS_WRITABLE => self::postStatusWritable($status['writable']),
            self::POST_STATUS_FILTER   => self::postStatusFilter($status['filter']),
        ] + SettingsSchemas::all() + SeoSchemas::all() + CommentSchemas::all() + MenuSchemas::all() + UserSchemas::all();
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
     * Both are global as vocabularies: `register_post_status()` takes no post type,
     * so a status registered anywhere is a status everywhere, and every managed
     * type reports the same writable enum. {@see \Kizlo\Tests\Introspection\PostStatusTest}
     * pins that, so a plugin filtering one type's schema cannot go unnoticed.
     *
     * What a given controller lets you *filter* by is not global, and core is what
     * makes it so: the attachments controller narrows its list enum to the three
     * statuses an attachment is ever stored with. Public because
     * {@see ManagedPostTypes::named()} compares against these before referring a
     * property to the shared schema, and refers only while the two still agree.
     *
     * @return array{writable: array<int, string>, filter: array<int, string>}
     */
    public static function statusVocabularies(): array
    {
        // Memoized for the same build rather than for the process: a controller
        // caches its own item schema, so a status registered after the first call
        // would never reach a later build. ManagedContent::flush() is what makes a
        // rebuild mean something, and it clears this with everything else derived.
        return self::$status ??= self::readStatusVocabularies();
    }

    public static function flush(): void
    {
        self::$status = null;
        self::$all    = null;
    }

    /**
     * @return array{writable: array<int, string>, filter: array<int, string>}
     */
    private static function readStatusVocabularies(): array
    {
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
