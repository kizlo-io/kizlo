<?php

namespace Kizlo\Modules\Appearance;

use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\CoreControllers;
use Kizlo\Modules\Introspection\CoreResource;

/**
 * What the two menu resources look like coming back from this site.
 *
 * A navigation menu is a `nav_menu` term and a menu item is a `nav_menu_item`
 * post, and core registers a `rest_controller_class` on both registrations. So
 * the controllers come from {@see CoreControllers}, the same way a managed post
 * type's does, and neither class is named here.
 *
 * The `kizlo` block is thinner than the comment one: {@see AppearanceRepository}
 * adds nothing of its own to a menu item beyond whatever the `kizlo_extend_menu_item`
 * filters contribute, and adds nothing at all to a menu. It is still described,
 * because a caller reading `extend` needs to know the key is always there.
 */
final class MenuSchemas
{
    public const MENU      = 'kizlo.menu';
    public const MENU_ITEM = 'kizlo.menu-item';

    public const MENU_DELETED      = 'kizlo.menu-deleted';
    public const MENU_ITEM_DELETED = 'kizlo.menu-item-deleted';

    /** The taxonomy and post type behind the two resources. */
    public const MENU_TAXONOMY  = 'nav_menu';
    public const MENU_ITEM_TYPE = 'nav_menu_item';

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            self::MENU              => self::menu(),
            self::MENU_ITEM         => self::menuItem(),
            self::MENU_DELETED      => self::deleted(self::MENU),
            self::MENU_ITEM_DELETED => self::deleted(self::MENU_ITEM),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function menu(): array
    {
        return [
            'type'        => 'object',
            'description' => 'A navigation menu.',
            'properties'  => CoreItemSchema::responseForController(
                CoreControllers::forTaxonomy(self::MENU_TAXONOMY),
                '/menus',
                CoreResource::CONTEXT,
            ),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function menuItem(): array
    {
        $properties = CoreItemSchema::responseForController(
            CoreControllers::forPostType(self::MENU_ITEM_TYPE),
            '/menu-items',
            CoreResource::CONTEXT,
        );

        $properties['kizlo'] = self::envelope();

        return [
            'type'        => 'object',
            'description' => 'A navigation menu item, with the Kizlo block the appearance extension adds.',
            'properties'  => $properties,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function envelope(): array
    {
        return [
            'type'       => 'object',
            'required'   => true,
            'properties' => [
                'extend' => [
                    'type'                 => 'object',
                    'required'             => true,
                    'additionalProperties' => true,
                    'description'          => 'Whatever the kizlo_extend_menu_item filters contributed.',
                ],
            ],
        ];
    }

    /**
     * Neither resource can be trashed, so a delete always reports what it removed
     * and there is only one shape to describe. A menu item refuses outright
     * without `force`, and a `nav_menu` term is a term, which core never trashes.
     *
     * @return array<string, mixed>
     */
    private static function deleted(string $item): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'deleted'  => ['type' => 'boolean', 'required' => true],
                'previous' => ['$ref' => $item, 'required' => true],
            ],
        ];
    }
}
