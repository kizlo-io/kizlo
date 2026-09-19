<?php

namespace Kizlo\Modules\CoreApi;

/**
 * The error codes core's own handlers raise, per resource and operation.
 *
 * Everything else about a described route is derived. This cannot be: a route
 * registration records a path, methods, arguments and a callback, and nowhere
 * among them is there a list of the `WP_Error` codes the handler can return. No
 * runtime API exposes one either. The only honest source is the controller's
 * raise sites in the WordPress source, which is where every code below was read
 * from, grouped by the method that raises it.
 *
 * So this is a hand-kept table, and it is the one hand-kept thing in this module.
 * It is keyed by API ID rather than by controller class because the two do not
 * line up: `WP_REST_Attachments_Controller` serves `/media` and also
 * `/media/{id}/edit`, and the upload failures belong to the first and not the
 * second. A resource with no entry carries only the pre-dispatch set
 * {@see \Kizlo\Modules\Introspection\OperationErrors::NATIVE}, which is the
 * truthful answer for a route nobody has read the source of.
 *
 * `rest_forbidden_context` is absent almost everywhere on purpose. Core raises it
 * from an `'edit' === $request['context']` branch, and a described route declares
 * no `context`, so it cannot be reached. The term list keeps it because
 * `WP_REST_Terms_Controller::get_items_permissions_check()` raises the same code
 * a second time for `?post=`, from a branch that never consults `context`.
 */
final class CoreRouteErrors
{
    /**
     * `WP_REST_Posts_Controller`, shared by every registration of it.
     *
     * `rest_forbidden_status` belongs to the list because it comes from
     * `sanitize_post_statuses()`, the sanitizer on the `status` collection
     * parameter, rather than from any write.
     *
     * @var array<string, array<int, string>>
     */
    private const POST_TYPE = [
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
     * `WP_REST_Terms_Controller`, shared by every taxonomy registration.
     *
     * @var array<string, array<int, string>>
     */
    private const TAXONOMY = [
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
     * `WP_REST_Comments_Controller`.
     *
     * @var array<string, array<int, string>>
     */
    private const COMMENTS = [
        'list' => [
        'rest_cannot_read',
        'rest_cannot_read_post',
        'rest_comment_not_supported_post_type',
        'rest_forbidden_param',
        ],
        'retrieve' => [
        'rest_cannot_read',
        'rest_cannot_read_post',
        'rest_comment_invalid_id',
        'rest_post_invalid_id',
        ],
        'create' => [
        'rest_cannot_create_note',
        'rest_cannot_read_post',
        'rest_comment_author_data_required',
        'rest_comment_closed',
        'rest_comment_content_invalid',
        'rest_comment_draft_post',
        'rest_comment_exists',
        'rest_comment_failed_create',
        'rest_comment_invalid_author',
        'rest_comment_invalid_author_ip',
        'rest_comment_invalid_post_id',
        'rest_comment_invalid_status',
        'rest_comment_login_required',
        'rest_comment_not_supported_post_type',
        'rest_comment_trash_post',
        'rest_invalid_comment_type',
        ],
        'update' => [
        'rest_cannot_edit',
        'rest_comment_content_invalid',
        'rest_comment_failed_edit',
        'rest_comment_invalid_id',
        'rest_comment_invalid_post_id',
        'rest_comment_invalid_type',
        'rest_post_invalid_id',
        ],
        'delete' => [
        'rest_already_trashed',
        'rest_cannot_delete',
        'rest_comment_author_invalid',
        'rest_comment_invalid_id',
        'rest_post_invalid_id',
        'rest_trash_not_supported',
        ],
        ];

    /**
     * `WP_REST_Menus_Controller` over the term set: the subclass adds
     * `rest_cannot_view` on both reads and `rest_invalid_menu_location` on both
     * writes.
     *
     * @var array<string, array<int, string>>
     */
    private const MENUS = [
        'list' => [
        'rest_cannot_view',
        'rest_forbidden_context',
        'rest_post_invalid_id',
        ],
        'retrieve' => [
        'rest_cannot_view',
        'rest_term_invalid',
        ],
        'create' => [
        'rest_cannot_create',
        'rest_invalid_menu_location',
        'rest_taxonomy_not_hierarchical',
        'rest_term_invalid',
        ],
        'update' => [
        'rest_cannot_update',
        'rest_invalid_menu_location',
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
     * `WP_REST_Menu_Items_Controller` over the post-type set: the subclass adds
     * `rest_cannot_view` on both reads and `rest_invalid_url` on both writes, and
     * refuses a delete without `force`.
     *
     * @var array<string, array<int, string>>
     */
    private const MENU_ITEMS = [
        'list' => [
        'rest_cannot_view',
        'rest_no_search_term_defined',
        'rest_orderby_include_missing_include',
        'rest_post_invalid_page_number',
        ],
        'retrieve' => [
        'rest_cannot_view',
        'rest_post_invalid_id',
        ],
        'create' => [
        'rest_cannot_assign_term',
        'rest_cannot_create',
        'rest_invalid_url',
        'rest_post_exists',
        ],
        'update' => [
        'rest_cannot_assign_term',
        'rest_cannot_edit',
        'rest_invalid_url',
        'rest_post_invalid_id',
        ],
        'delete' => [
        'rest_cannot_delete',
        'rest_post_invalid_id',
        'rest_trash_not_supported',
        'rest_user_cannot_delete_post',
        ],
        ];

    /**
     * Which table describes which resource.
     *
     * Every registration of `WP_REST_Posts_Controller` raises what that class
     * raises, so `posts`, `pages`, `blocks` and `navigation` share one table, and
     * a custom post type someone registers shares it too.
     *
     * @var array<string, array<string, array<int, string>>>
     */
    private const RESOURCES = [
        'comments'          => self::COMMENTS,
        'menus'             => self::MENUS,
        'menuItems'         => self::MENU_ITEMS,
        'posts'             => self::POST_TYPE,
        'pages'             => self::POST_TYPE,
        'blocks'            => self::POST_TYPE,
        'navigation'        => self::POST_TYPE,
        'categories'        => self::TAXONOMY,
        'tags'              => self::TAXONOMY,
        'wpPatternCategory' => self::TAXONOMY,
    ];

    /**
     * @return array<int, string>
     */
    public static function forResource(string $apiId, string $operation): array
    {
        return self::RESOURCES[$apiId][$operation] ?? [];
    }
}
