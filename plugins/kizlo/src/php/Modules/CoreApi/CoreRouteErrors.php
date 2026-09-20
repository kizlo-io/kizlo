<?php

namespace Kizlo\Modules\CoreApi;

use Kizlo\Modules\Introspection\PathNormalizer;
use WP_REST_Controller;

/**
 * WordPress REST handler errors, contributed through the public collection.
 *
 * Registrations do not expose errors, so these tables are read from controller
 * source and keyed by controller family plus callback method. They are resolved
 * to concrete route selectors only after WordPress has built its route table.
 */
final class CoreRouteErrors
{
    /** @var array<string, array<int, string>> */
    private const POST_TYPE = [
        'get_items' => ['rest_forbidden_status', 'rest_no_search_term_defined', 'rest_orderby_include_missing_include', 'rest_post_invalid_page_number'],
        'get_item' => ['rest_post_incorrect_password', 'rest_post_invalid_id'],
        'create_item' => [
            'rest_cannot_assign_sticky', 'rest_cannot_assign_term', 'rest_cannot_create',
            'rest_cannot_edit_others', 'rest_cannot_publish', 'rest_invalid_author',
            'rest_invalid_featured_media', 'rest_invalid_field', 'rest_post_exists',
        ],
        'update_item' => [
            'rest_cannot_assign_sticky', 'rest_cannot_assign_term', 'rest_cannot_edit',
            'rest_cannot_edit_others', 'rest_cannot_publish', 'rest_invalid_author',
            'rest_invalid_featured_media', 'rest_invalid_field', 'rest_post_invalid_id',
        ],
        'delete_item' => [
            'rest_already_trashed', 'rest_cannot_delete', 'rest_post_invalid_id',
            'rest_trash_not_supported', 'rest_user_cannot_delete_post',
        ],
    ];

    /** @var array<string, array<int, string>> */
    private const TAXONOMY = [
        'get_items' => ['rest_forbidden_context', 'rest_post_invalid_id'],
        'get_item' => ['rest_term_invalid'],
        'create_item' => ['rest_cannot_create', 'rest_taxonomy_not_hierarchical', 'rest_term_invalid'],
        'update_item' => ['rest_cannot_update', 'rest_taxonomy_not_hierarchical', 'rest_term_invalid'],
        'delete_item' => ['rest_cannot_delete', 'rest_term_invalid', 'rest_trash_not_supported'],
    ];

    /** @var array<string, array<int, string>> */
    private const COMMENTS = [
        'get_items' => ['rest_cannot_read', 'rest_cannot_read_post', 'rest_comment_not_supported_post_type', 'rest_forbidden_param'],
        'get_item' => ['rest_cannot_read', 'rest_cannot_read_post', 'rest_comment_invalid_id', 'rest_post_invalid_id'],
        'create_item' => [
            'rest_cannot_create_note', 'rest_cannot_read_post', 'rest_comment_author_data_required',
            'rest_comment_closed', 'rest_comment_content_invalid', 'rest_comment_draft_post',
            'rest_comment_exists', 'rest_comment_failed_create', 'rest_comment_invalid_author',
            'rest_comment_invalid_author_ip', 'rest_comment_invalid_post_id', 'rest_comment_invalid_status',
            'rest_comment_login_required', 'rest_comment_not_supported_post_type',
            'rest_comment_trash_post', 'rest_invalid_comment_type',
        ],
        'update_item' => [
            'rest_cannot_edit', 'rest_comment_content_invalid', 'rest_comment_failed_edit',
            'rest_comment_invalid_id', 'rest_comment_invalid_post_id',
            'rest_comment_invalid_type', 'rest_post_invalid_id',
        ],
        'delete_item' => [
            'rest_already_trashed', 'rest_cannot_delete', 'rest_comment_author_invalid',
            'rest_comment_invalid_id', 'rest_post_invalid_id', 'rest_trash_not_supported',
        ],
    ];

    /** @var array<string, array<int, string>> */
    private const MENUS = [
        'get_items' => ['rest_cannot_view', 'rest_forbidden_context', 'rest_post_invalid_id'],
        'get_item' => ['rest_cannot_view', 'rest_term_invalid'],
        'create_item' => ['rest_cannot_create', 'rest_invalid_menu_location', 'rest_taxonomy_not_hierarchical', 'rest_term_invalid'],
        'update_item' => ['rest_cannot_update', 'rest_invalid_menu_location', 'rest_taxonomy_not_hierarchical', 'rest_term_invalid'],
        'delete_item' => ['rest_cannot_delete', 'rest_term_invalid', 'rest_trash_not_supported'],
    ];

    /** @var array<string, array<int, string>> */
    private const MENU_ITEMS = [
        'get_items' => ['rest_cannot_view', 'rest_no_search_term_defined', 'rest_orderby_include_missing_include', 'rest_post_invalid_page_number'],
        'get_item' => ['rest_cannot_view', 'rest_post_invalid_id'],
        'create_item' => ['rest_cannot_assign_term', 'rest_cannot_create', 'rest_invalid_url', 'rest_post_exists'],
        'update_item' => ['rest_cannot_assign_term', 'rest_cannot_edit', 'rest_invalid_url', 'rest_post_invalid_id'],
        'delete_item' => ['rest_cannot_delete', 'rest_post_invalid_id', 'rest_trash_not_supported', 'rest_user_cannot_delete_post'],
    ];

    /** @var array<string, array<int, string>> */
    private const ATTACHMENTS = [
        'create_item' => [
            'rest_cannot_create', 'rest_cannot_edit', 'rest_invalid_param', 'rest_no_featured_media',
            'rest_post_invalid_id', 'rest_sideload_attachment_not_in_uploads',
            'rest_sideload_invalid_image', 'rest_sideload_update_attached_file_failed',
            'rest_upload_dimension_mismatch', 'rest_upload_file_error', 'rest_upload_file_too_big',
            'rest_upload_hash_mismatch', 'rest_upload_image_type_not_supported',
            'rest_upload_invalid_dimensions', 'rest_upload_invalid_image', 'rest_upload_limited_space',
            'rest_upload_no_content_disposition', 'rest_upload_no_content_type', 'rest_upload_no_data',
            'rest_upload_sideload_error', 'rest_upload_unknown_error', 'rest_upload_unknown_size',
            'rest_upload_user_quota_exceeded',
        ],
        'update_item' => ['rest_invalid_param', 'rest_no_featured_media'],
        'edit_media_item' => [
            'rest_cannot_edit_file_type', 'rest_cannot_edit_image', 'rest_image_crop_failed',
            'rest_image_flip_failed', 'rest_image_not_edited', 'rest_image_rotation_failed',
            'rest_unknown_attachment', 'rest_unknown_image_file_type',
        ],
        'post_process_item' => ['rest_cannot_edit', 'rest_post_invalid_id'],
        'sideload_item' => [
            'rest_cannot_edit', 'rest_cannot_edit_image', 'rest_invalid_type', 'rest_not_in_enum',
            'rest_post_invalid_id', 'rest_sideload_attachment_not_in_uploads',
            'rest_sideload_invalid_image', 'rest_sideload_update_attached_file_failed',
            'rest_upload_dimension_mismatch', 'rest_upload_file_too_big', 'rest_upload_hash_mismatch',
            'rest_upload_invalid_dimensions', 'rest_upload_invalid_image', 'rest_upload_limited_space',
            'rest_upload_no_content_disposition', 'rest_upload_no_content_type', 'rest_upload_no_data',
            'rest_upload_sideload_error', 'rest_upload_unknown_error', 'rest_upload_unknown_size',
            'rest_upload_user_quota_exceeded',
        ],
        'finalize_item' => [
            'rest_cannot_edit', 'rest_cannot_edit_image', 'rest_invalid_sub_size_file',
            'rest_invalid_sub_size_name', 'rest_invalid_type', 'rest_not_in_enum', 'rest_post_invalid_id',
        ],
    ];

    /** @var array<string, array<int, string>> */
    private const USERS = [
        'get_items' => ['rest_forbidden_orderby', 'rest_forbidden_who', 'rest_user_cannot_view'],
        'get_item' => ['rest_user_cannot_view', 'rest_user_invalid_id'],
        'get_current_item' => ['rest_not_logged_in'],
        'create_item' => [
            'rest_cannot_create_user', 'rest_invalid_param', 'rest_user_create', 'rest_user_exists',
            'rest_user_invalid_password', 'rest_user_invalid_role', 'rest_user_invalid_username',
        ],
        'update_item' => [
            'rest_cannot_edit', 'rest_cannot_edit_roles', 'rest_user_invalid_argument',
            'rest_user_invalid_email', 'rest_user_invalid_id', 'rest_user_invalid_password',
            'rest_user_invalid_role', 'rest_user_invalid_slug',
        ],
        'delete_item' => [
            'rest_cannot_delete', 'rest_trash_not_supported', 'rest_user_cannot_delete',
            'rest_user_invalid_id', 'rest_user_invalid_reassign',
        ],
    ];

    /** @var array<string, array<int, string>> */
    private const APPLICATION_PASSWORDS = [
        'get_items' => ['application_passwords_disabled', 'application_passwords_disabled_for_user', 'rest_cannot_list_application_passwords', 'rest_not_logged_in', 'rest_user_invalid_id'],
        'get_item' => ['application_passwords_disabled', 'application_passwords_disabled_for_user', 'rest_application_password_not_found', 'rest_cannot_read_application_password', 'rest_not_logged_in', 'rest_user_invalid_id'],
        'get_current_item' => ['rest_application_password_not_found', 'rest_cannot_introspect_app_password_for_non_authenticated_user', 'rest_no_authenticated_app_password'],
        'create_item' => ['application_passwords_disabled', 'application_passwords_disabled_for_user', 'rest_cannot_create_application_passwords', 'rest_not_logged_in', 'rest_user_invalid_id'],
        'update_item' => ['application_passwords_disabled', 'application_passwords_disabled_for_user', 'rest_application_password_not_found', 'rest_cannot_edit_application_password', 'rest_not_logged_in', 'rest_user_invalid_id'],
        'delete_item' => ['application_passwords_disabled', 'application_passwords_disabled_for_user', 'rest_application_password_not_found', 'rest_cannot_delete_application_password', 'rest_not_logged_in', 'rest_user_invalid_id'],
        'delete_items' => ['application_passwords_disabled', 'application_passwords_disabled_for_user', 'rest_cannot_delete_application_passwords', 'rest_not_logged_in', 'rest_user_invalid_id'],
    ];

    /** @var array<string, array<int, string>> */
    private const SETTINGS = ['update_item' => ['rest_invalid_stored_value']];

    /**
     * @param array<int, mixed> $entries
     * @return array<int, mixed>
     */
    public static function register(array $entries): array
    {
        $described = [];

        foreach (RouteDiscovery::declarations() as $declaration) {
            $namespace = $declaration['namespace'] ?? null;
            $route     = $declaration['route'] ?? null;
            $method    = $declaration['method'] ?? null;

            if (is_string($namespace) && is_string($route) && is_string($method)) {
                $normalized = PathNormalizer::normalize($route);

                if ($normalized['errors'] === []) {
                    $described[self::key($namespace, $normalized['path'], $method)] = true;
                }
            }
        }

        foreach (rest_get_server()->get_routes() as $registered => $handlers) {
            foreach (RouteDiscovery::NAMESPACES as $namespace) {
                $prefix = '/' . trim($namespace, '/');

                if ($registered === $prefix || !str_starts_with($registered, $prefix . '/')) {
                    continue;
                }

                $route      = substr($registered, strlen($prefix));
                $normalized = PathNormalizer::normalize($route);

                if ($normalized['errors'] !== []) {
                    continue;
                }

                $addresses  = str_ends_with($normalized['path'], '}');

                foreach (is_array($handlers) ? $handlers : [] as $handler) {
                    if (!is_array($handler)) {
                        continue;
                    }

                    $callback = $handler['callback'] ?? null;

                    if (!is_array($callback) || !($callback[0] ?? null) instanceof WP_REST_Controller) {
                        continue;
                    }

                    $controller = $callback[0];
                    $methodName = is_string($callback[1] ?? null) ? $callback[1] : '';
                    $errors     = self::forController($controller, $methodName);

                    if ($errors === []) {
                        continue;
                    }

                    foreach (RouteMethods::operations($handler, $methodName, $addresses) as $method) {
                        if (!isset($described[self::key($namespace, $normalized['path'], $method)])) {
                            continue;
                        }

                        $entries[] = [
                            'route' => ['namespace' => $namespace, 'path' => $normalized['path'], 'method' => $method],
                            'errors' => $errors,
                        ];
                    }
                }
            }
        }

        return $entries;
    }

    private static function key(string $namespace, string $route, string $method): string
    {
        return implode("\0", [$namespace, $route, $method]);
    }

    /** @return array<int, string> */
    private static function forController(WP_REST_Controller $controller, string $callback): array
    {
        $table = match (true) {
            $controller instanceof \WP_REST_Attachments_Controller           => self::attachments(),
            $controller instanceof \WP_REST_Menu_Items_Controller            => self::MENU_ITEMS,
            $controller instanceof \WP_REST_Menus_Controller                 => self::MENUS,
            $controller instanceof \WP_REST_Comments_Controller              => self::COMMENTS,
            $controller instanceof \WP_REST_Application_Passwords_Controller => self::APPLICATION_PASSWORDS,
            $controller instanceof \WP_REST_Users_Controller                 => self::USERS,
            $controller instanceof \WP_REST_Settings_Controller              => self::SETTINGS,
            $controller instanceof \WP_REST_Terms_Controller                 => self::TAXONOMY,
            $controller instanceof \WP_REST_Posts_Controller                 => self::POST_TYPE,
            default                                                          => [],
        };

        return $table[$callback] ?? [];
    }

    /** @return array<string, array<int, string>> */
    private static function attachments(): array
    {
        $table = self::POST_TYPE;

        foreach (self::ATTACHMENTS as $callback => $errors) {
            $table[$callback] = array_values(array_unique(array_merge($table[$callback] ?? [], $errors)));
        }

        return $table;
    }
}
