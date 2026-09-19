<?php

namespace Kizlo\Modules\Introspection;

/**
 * The error codes core's own controllers raise, per operation.
 *
 * {@see OperationErrors} covers what WordPress can fail with before any handler
 * runs. This covers what the handler itself returns, and it is read off the
 * controller's raise sites rather than from the REST handbook, the same way
 * {@see \Kizlo\Modules\Appearance\MenuRoutes} documents the two menu resources.
 *
 * The sets are shared because the controllers are. Posts, pages, reusable blocks
 * and navigation menus are four registrations of `WP_REST_Posts_Controller`, and
 * a resource that is genuinely one of those raises exactly what that class
 * raises. Where a subclass adds its own, the resource names the addition rather
 * than restating the whole set.
 *
 * ## `rest_forbidden_context` is usually absent, and sometimes is not
 *
 * {@see CoreResource} declares no `context` parameter, so a raise site guarded by
 * `'edit' === $request['context']` cannot be reached and listing its code would
 * describe an answer the route cannot give. The exceptions are raise sites that
 * never consult `context` at all, and there is one that matters here:
 * `WP_REST_Terms_Controller::get_items_permissions_check()` raises the same code
 * a second time for `?post=` when the caller cannot read that post's terms. So a
 * term list keeps it and every other read here drops it.
 */
final class CoreRouteErrors
{
    /**
     * `WP_REST_Posts_Controller`, which serves `posts`, `pages`, `blocks` and
     * `navigation` alike.
     *
     * `rest_forbidden_status` belongs to the list because it comes from
     * `sanitize_post_statuses()`, the sanitizer on the `status` collection
     * parameter, rather than from any write.
     *
     * @var array<string, array<int, string>>
     */
    public const POST_TYPE = [
        'list' => [
            'rest_forbidden_status',
            'rest_no_search_term_defined',
            'rest_orderby_include_missing_include',
            'rest_post_invalid_page_number',
        ],
        'retrieve' => [
            'rest_post_incorrect_password',
            'rest_post_invalid_id',
        ],
        'create' => [
            'rest_cannot_assign_sticky',
            'rest_cannot_assign_term',
            'rest_cannot_create',
            'rest_cannot_edit_others',
            'rest_cannot_publish',
            'rest_invalid_author',
            'rest_invalid_featured_media',
            'rest_invalid_field',
            'rest_post_exists',
        ],
        'update' => [
            'rest_cannot_assign_sticky',
            'rest_cannot_assign_term',
            'rest_cannot_edit',
            'rest_cannot_edit_others',
            'rest_cannot_publish',
            'rest_invalid_author',
            'rest_invalid_featured_media',
            'rest_invalid_field',
            'rest_post_invalid_id',
        ],
        'delete' => [
            'rest_already_trashed',
            'rest_cannot_delete',
            'rest_post_invalid_id',
            'rest_trash_not_supported',
            'rest_user_cannot_delete_post',
        ],
    ];

    /**
     * `WP_REST_Terms_Controller`, which serves `categories`, `tags` and
     * `patternCategories`.
     *
     * @var array<string, array<int, string>>
     */
    public const TAXONOMY = [
        'list' => [
            'rest_forbidden_context',
            'rest_post_invalid_id',
        ],
        'retrieve' => [
            'rest_term_invalid',
        ],
        'create' => [
            'rest_cannot_create',
            'rest_taxonomy_not_hierarchical',
            'rest_term_invalid',
        ],
        'update' => [
            'rest_cannot_update',
            'rest_taxonomy_not_hierarchical',
            'rest_term_invalid',
        ],
        'delete' => [
            'rest_cannot_delete',
            'rest_term_invalid',
            'rest_trash_not_supported',
        ],
    ];

    /**
     * `WP_REST_Attachments_Controller` over the post-type set.
     *
     * The additions are all about carrying a file: the permission check refuses
     * an unsupported image type, `check_upload_size()` enforces the site's limits
     * and quota, and the two upload paths — a request body or a sideloaded URL —
     * each have their own failures. The two actions are the controller's alone.
     *
     * @var array<string, array<int, string>>
     */
    public const MEDIA = [
        'list'     => self::POST_TYPE['list'],
        'retrieve' => self::POST_TYPE['retrieve'],
        'create'   => [
            ...self::POST_TYPE['create'],
            'rest_cannot_edit',
            'rest_invalid_url',
            'rest_no_featured_media',
            'rest_upload_file_error',
            'rest_upload_file_too_big',
            'rest_upload_hash_mismatch',
            'rest_upload_image_type_not_supported',
            'rest_upload_invalid_disposition',
            'rest_upload_limited_space',
            'rest_upload_no_content_disposition',
            'rest_upload_no_content_type',
            'rest_upload_no_data',
            'rest_upload_sideload_error',
            'rest_upload_unknown_error',
            'rest_upload_user_quota_exceeded',
        ],
        'update' => self::POST_TYPE['update'],
        'delete' => self::POST_TYPE['delete'],
        'post_process' => [
            'rest_post_invalid_id',
        ],
        'edit' => [
            'rest_cannot_edit_file_type',
            'rest_cannot_edit_image',
            'rest_image_crop_failed',
            'rest_image_flip_failed',
            'rest_image_not_edited',
            'rest_image_rotation_failed',
            'rest_unknown_attachment',
            'rest_unknown_image_file_type',
        ],
    ];
}
