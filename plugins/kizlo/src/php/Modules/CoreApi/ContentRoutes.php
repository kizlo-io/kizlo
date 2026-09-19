<?php

namespace Kizlo\Modules\CoreApi;

use Kizlo\Modules\Introspection\CoreAction;
use Kizlo\Modules\Introspection\CoreControllers;
use Kizlo\Modules\Introspection\CoreIdentifier;
use Kizlo\Modules\Introspection\CoreResource;
use Kizlo\Modules\Introspection\CoreRouteArgs;
use Kizlo\Modules\Introspection\CoreRouteErrors;
use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Introspection\Spec;

/**
 * The `wp/v2` content and term contracts.
 *
 * Posts, pages, media, blocks, navigation, categories, tags and pattern
 * categories. Kizlo serves none of them: these are WordPress's own routes for
 * WordPress's own registered types, and Kizlo already serving comparable records
 * through `kizlo/v1/post-types/*` does not describe them.
 *
 * All eight are the same two controllers behind different registrations, so the
 * error sets come in pairs rather than one per resource — {@see CoreRouteErrors}
 * holds them, read off the controllers' own raise sites. Media is the exception
 * that earns its own handling: it uploads, so its create is `multipart/form-data`
 * and it registers two actions no other content resource has.
 */
final class ContentRoutes
{
    public const POSTS              = 'posts';
    public const PAGES              = 'pages';
    public const MEDIA              = 'media';
    public const BLOCKS             = 'blocks';
    public const NAVIGATION         = 'navigation';
    public const CATEGORIES         = 'categories';
    public const TAGS               = 'tags';
    public const PATTERN_CATEGORIES = 'patternCategories';

    public static function register(): void
    {
        foreach (self::resources() as $id => $factory) {
            foreach ($factory()->operations() as $operation) {
                kizlo_register_route_spec(
                    static fn(): array => self::resources()[$id]()->operation($operation),
                );
            }
        }
    }

    /**
     * @return array<string, callable(): CoreResource>
     */
    private static function resources(): array
    {
        return [
            self::POSTS              => static fn(): CoreResource => self::postType(self::POSTS, 'post', '/posts', 'post', 'posts', ContentSchemas::POST, ContentSchemas::POST_DELETED),
            self::PAGES              => static fn(): CoreResource => self::postType(self::PAGES, 'page', '/pages', 'page', 'pages', ContentSchemas::PAGE, ContentSchemas::PAGE_DELETED),
            self::BLOCKS             => static fn(): CoreResource => self::postType(self::BLOCKS, 'wp_block', '/blocks', 'reusable block', 'reusable blocks', ContentSchemas::BLOCK, ContentSchemas::BLOCK_DELETED),
            self::NAVIGATION         => static fn(): CoreResource => self::postType(self::NAVIGATION, 'wp_navigation', '/navigation', 'navigation menu', 'navigation menus', ContentSchemas::NAVIGATION, ContentSchemas::NAVIGATION_DELETED),
            self::MEDIA              => static fn(): CoreResource => self::media(),
            self::CATEGORIES         => static fn(): CoreResource => self::taxonomy(self::CATEGORIES, 'category', '/categories', 'category', 'categories', ContentSchemas::CATEGORY, ContentSchemas::CATEGORY_DELETED),
            self::TAGS               => static fn(): CoreResource => self::taxonomy(self::TAGS, 'post_tag', '/tags', 'tag', 'tags', ContentSchemas::TAG, ContentSchemas::TAG_DELETED),
            self::PATTERN_CATEGORIES => static fn(): CoreResource => self::taxonomy(self::PATTERN_CATEGORIES, 'wp_pattern_category', '/wp_pattern_category', 'pattern category', 'pattern categories', ContentSchemas::PATTERN_CATEGORY, ContentSchemas::PATTERN_CATEGORY_DELETED),
        ];
    }

    private static function postType(
        string $id,
        string $slug,
        string $base,
        string $noun,
        string $plural,
        string $item,
        string $deleted,
    ): CoreResource {
        return new CoreResource(
            id: $id,
            namespace: 'wp/v2',
            base: $base,
            controller: CoreControllers::forPostType($slug),
            item: $item,
            noun: $noun,
            plural: $plural,
            identifier: CoreIdentifier::numeric($noun),
            deleted: $deleted,
            force: self::trashForce($slug),
            errors: CoreRouteErrors::POST_TYPE,
        );
    }

    private static function taxonomy(
        string $id,
        string $slug,
        string $base,
        string $noun,
        string $plural,
        string $item,
        string $deleted,
    ): CoreResource {
        return new CoreResource(
            id: $id,
            namespace: 'wp/v2',
            base: $base,
            controller: CoreControllers::forTaxonomy($slug),
            item: $item,
            noun: $noun,
            plural: $plural,
            identifier: CoreIdentifier::numeric($noun),
            deleted: $deleted,
            force: 'Required. A term is not trashable, so a delete is always permanent.',
            errors: CoreRouteErrors::TAXONOMY,
        );
    }

    /**
     * Media is a post type that carries a file, and every difference follows from
     * that. The create is `multipart/form-data` because `WP_REST_Attachments_Controller`
     * reads `$_FILES`; the delete has no trash to fall back on unless the site
     * defines `MEDIA_TRASH`; and core registers two actions on the single item,
     * one finishing the sub-size generation a large upload defers and one applying
     * a crop or rotation.
     */
    private static function media(): CoreResource
    {
        $identifier = CoreIdentifier::numeric('attachment');

        return new CoreResource(
            id: self::MEDIA,
            namespace: 'wp/v2',
            base: '/media',
            controller: CoreControllers::forPostType('attachment'),
            item: ContentSchemas::MEDIA,
            noun: 'attachment',
            plural: 'attachments',
            operations: [...CoreResource::CRUD, 'post_process', 'edit'],
            identifier: $identifier,
            deleted: ContentSchemas::MEDIA_DELETED,
            force: self::trashForce('attachment'),
            errors: CoreRouteErrors::MEDIA,
            actions: [
                'post_process' => new CoreAction(
                    method: 'POST',
                    route: $identifier->segment('/media') . '/post-process',
                    summary: 'Finish processing an uploaded attachment',
                    input: static fn(): array => $identifier->property() + CoreRouteArgs::forRoute('wp/v2', $identifier->segment('/media') . '/post-process', 'POST'),
                    responses: [
                        '200' => ['description' => 'The attachment.', 'body' => ['$ref' => ContentSchemas::MEDIA]],
                        '404' => ['description' => 'No such attachment.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                    ],
                ),
                'edit' => new CoreAction(
                    method: 'POST',
                    route: $identifier->segment('/media') . '/edit',
                    summary: 'Crop or rotate an image attachment',
                    input: static fn(): array => $identifier->property() + CoreRouteArgs::forRoute('wp/v2', $identifier->segment('/media') . '/edit', 'POST'),
                    responses: [
                        '201' => ['description' => 'The attachment the edit produced.', 'body' => ['$ref' => ContentSchemas::MEDIA]],
                        '404' => ['description' => 'No such attachment.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                    ],
                    contentType: Spec::JSON_CONTENT_TYPE,
                ),
            ],
            createContentType: 'multipart/form-data',
        );
    }

    private static function trashForce(string $postType): string
    {
        return DeletedSchema::postTypeTrashes($postType)
            ? 'Whether to bypass the trash and delete permanently. Without it the record is trashed and returned.'
            : 'Required. This type is not trashable on this site, so a delete without it answers 501.';
    }
}
