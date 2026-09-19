<?php

namespace Kizlo\Modules\CoreApi;

use Kizlo\Modules\Introspection\CoreControllers;
use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\CoreResource;

/**
 * What core's content and term resources look like coming back from this site.
 *
 * Every shape here is derived from the controller {@see CoreControllers} names
 * for the registered type, so a field WordPress adds in a later release reaches
 * the contract without anyone auditing core again. Nothing in this file lists a
 * property.
 *
 * ## Why these IDs carry `wp-`
 *
 * The first three described core resources took the bare noun — `kizlo.comment`,
 * `kizlo.menu`, `kizlo.menu-item` — and that worked while there were three. It
 * does not survive a surface this size: `kizlo.media` is already Kizlo's own
 * resolved media block ({@see \Kizlo\Modules\Introspection\CoreSchemas::MEDIA}),
 * and core's `wp/v2/media` is a different thing entirely. So every schema added
 * here says which surface it describes. The three existing IDs keep their names
 * rather than churning a contract everyone has already generated against.
 */
final class ContentSchemas
{
    public const POST              = 'kizlo.wp-post';
    public const PAGE              = 'kizlo.wp-page';
    public const MEDIA             = 'kizlo.wp-media';
    public const BLOCK             = 'kizlo.wp-block';
    public const NAVIGATION        = 'kizlo.wp-navigation';
    public const CATEGORY          = 'kizlo.wp-category';
    public const TAG               = 'kizlo.wp-tag';
    public const PATTERN_CATEGORY  = 'kizlo.wp-pattern-category';

    public const POST_DELETED             = 'kizlo.wp-post-deleted';
    public const PAGE_DELETED             = 'kizlo.wp-page-deleted';
    public const MEDIA_DELETED            = 'kizlo.wp-media-deleted';
    public const BLOCK_DELETED            = 'kizlo.wp-block-deleted';
    public const NAVIGATION_DELETED       = 'kizlo.wp-navigation-deleted';
    public const CATEGORY_DELETED         = 'kizlo.wp-category-deleted';
    public const TAG_DELETED              = 'kizlo.wp-tag-deleted';
    public const PATTERN_CATEGORY_DELETED = 'kizlo.wp-pattern-category-deleted';

    /**
     * The registered type behind each resource, and the path it is derived at.
     *
     * The path matters: {@see CoreItemSchema} memoizes on it, and it is what a
     * translation diagnostic points at when a field cannot be expressed.
     *
     * @var array<string, array{0: string, 1: string}>
     */
    private const POST_TYPES = [
        self::POST       => ['post', '/posts'],
        self::PAGE       => ['page', '/pages'],
        self::MEDIA      => ['attachment', '/media'],
        self::BLOCK      => ['wp_block', '/blocks'],
        self::NAVIGATION => ['wp_navigation', '/navigation'],
    ];

    /** @var array<string, array{0: string, 1: string}> */
    private const TAXONOMIES = [
        self::CATEGORY         => ['category', '/categories'],
        self::TAG              => ['post_tag', '/tags'],
        self::PATTERN_CATEGORY => ['wp_pattern_category', '/wp_pattern_category'],
    ];

    /** @var array<string, string> */
    private const DELETED = [
        self::POST_DELETED             => self::POST,
        self::PAGE_DELETED             => self::PAGE,
        self::MEDIA_DELETED            => self::MEDIA,
        self::BLOCK_DELETED            => self::BLOCK,
        self::NAVIGATION_DELETED       => self::NAVIGATION,
        self::CATEGORY_DELETED         => self::CATEGORY,
        self::TAG_DELETED              => self::TAG,
        self::PATTERN_CATEGORY_DELETED => self::PATTERN_CATEGORY,
    ];

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        $schemas = [];

        foreach (self::POST_TYPES as $id => [$slug, $route]) {
            $schemas[$id] = [
                'type'        => 'object',
                'description' => sprintf('A %s, as WordPress core returns it.', str_replace('_', ' ', $slug)),
                'properties'  => CoreItemSchema::responseForController(
                    CoreControllers::forPostType($slug),
                    $route,
                    CoreResource::CONTEXT,
                ),
            ];
        }

        foreach (self::TAXONOMIES as $id => [$slug, $route]) {
            $schemas[$id] = [
                'type'        => 'object',
                'description' => sprintf('A %s term, as WordPress core returns it.', str_replace('_', ' ', $slug)),
                'properties'  => CoreItemSchema::responseForController(
                    CoreControllers::forTaxonomy($slug),
                    $route,
                    CoreResource::CONTEXT,
                ),
            ];
        }

        foreach (self::DELETED as $id => $item) {
            $schemas[$id] = self::deletedFor($item);
        }

        return $schemas;
    }

    /**
     * @return array<string, mixed>
     */
    private static function deletedFor(string $item): array
    {
        $postType = self::POST_TYPES[$item][0] ?? null;

        if ($postType === null) {
            // A term. WordPress has no term trash, so a delete always reports.
            return DeletedSchema::permanent($item);
        }

        return DeletedSchema::postTypeTrashes($postType)
            ? DeletedSchema::trashable($item)
            : DeletedSchema::permanent($item);
    }
}
