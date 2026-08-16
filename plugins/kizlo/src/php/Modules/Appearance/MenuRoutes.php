<?php

namespace Kizlo\Modules\Appearance;

use Kizlo\Modules\Introspection\CoreControllers;
use Kizlo\Modules\Introspection\CoreResource;

/**
 * The `wp/v2/menus` and `wp/v2/menu-items` contracts.
 *
 * Two resources rather than one. A menu is the container and a menu item is a row
 * in it, they hang off different controllers at different paths, and Kizlo reads
 * only the items. The containers are described anyway: the menu tests already
 * reach for `/menus` to find the menu they attach to, which is the shape of a gap
 * that would be filled by a raw call the next time someone needed it.
 *
 * Neither is served by this plugin. What Kizlo contributes is the `kizlo` block on
 * a menu item, which {@see AppearanceModule} attaches through `rest_prepare_nav_menu_item`.
 */
final class MenuRoutes
{
    public const MENU_API_ID      = 'menus';
    public const MENU_ITEM_API_ID = 'menuItems';

    public static function register(): void
    {
        foreach ([self::menus(), self::menuItems()] as $resource) {
            foreach ($resource->declarations() as $declaration) {
                kizlo_register_spec_route($declaration);
            }
        }
    }

    private static function menus(): CoreResource
    {
        return new CoreResource(
            id: self::MENU_API_ID,
            namespace: 'wp/v2',
            base: '/menus',
            controller: CoreControllers::forTaxonomy(MenuSchemas::MENU_TAXONOMY),
            item: MenuSchemas::MENU,
            deleted: MenuSchemas::MENU_DELETED,
            noun: 'menu',
            plural: 'menus',
            force: 'Required. A menu is a term, and terms do not support trashing, so a delete is always permanent.',
            errors: self::menuErrors(),
        );
    }

    private static function menuItems(): CoreResource
    {
        return new CoreResource(
            id: self::MENU_ITEM_API_ID,
            namespace: 'wp/v2',
            base: '/menu-items',
            controller: CoreControllers::forPostType(MenuSchemas::MENU_ITEM_TYPE),
            item: MenuSchemas::MENU_ITEM,
            deleted: MenuSchemas::MENU_ITEM_DELETED,
            noun: 'menu item',
            plural: 'menu items',
            force: 'Required. Menu items do not support trashing, and a delete without it answers 501.',
            errors: self::menuItemErrors(),
        );
    }

    /**
     * `WP_REST_Menus_Controller` over `WP_REST_Terms_Controller`. The subclass
     * contributes `rest_cannot_view` on both reads and `rest_invalid_menu_location`
     * on both writes; everything else is the term controller's.
     *
     * @return array<string, array<int, string>>
     */
    private static function menuErrors(): array
    {
        return [
            'list' => [
                'rest_cannot_view',
                'rest_forbidden_context',
                'rest_post_invalid_id',
            ],
            'retrieve' => [
                'rest_cannot_view',
                'rest_forbidden_context',
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
    }

    /**
     * `WP_REST_Menu_Items_Controller` over `WP_REST_Posts_Controller`. The subclass
     * contributes `rest_cannot_view` on both reads and `rest_invalid_url` on both
     * writes, and refuses a delete without `force`.
     *
     * @return array<string, array<int, string>>
     */
    private static function menuItemErrors(): array
    {
        return [
            'list' => [
                'rest_cannot_view',
                'rest_forbidden_context',
                'rest_no_search_term_defined',
                'rest_orderby_include_missing_include',
                'rest_post_invalid_page_number',
            ],
            'retrieve' => [
                'rest_cannot_view',
                'rest_forbidden_context',
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
    }
}
