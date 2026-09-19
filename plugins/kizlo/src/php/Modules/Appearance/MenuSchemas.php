<?php

namespace Kizlo\Modules\Appearance;

/**
 * What Kizlo adds to a menu item, on top of what core declares.
 *
 * The menu and menu-item shapes themselves are no longer written here. They are
 * derived from the controllers core registers `wp/v2/menus` and `wp/v2/menu-items`
 * with, the same way every other described route is, so a field WordPress adds
 * in a later release reaches the contract without anyone auditing core again.
 *
 * What survives is the part no derivation can reach. {@see AppearanceModule}
 * attaches a `kizlo` block to every menu item through `rest_prepare_nav_menu_item`,
 * which happens long after `get_item_schema()` was built and is therefore
 * invisible to it. Without this the contract would describe a response missing a
 * key every response carries.
 *
 * The block is thinner than the comment one: {@see AppearanceRepository} adds
 * nothing of its own beyond whatever the `kizlo_extend_menu_item` filters
 * contribute, and adds nothing at all to a menu. It is still described, because a
 * caller reading `extend` needs to know the key is always there.
 */
final class MenuSchemas
{
    /** The taxonomy and post type behind the two resources. */
    public const MENU_TAXONOMY  = 'nav_menu';
    public const MENU_ITEM_TYPE = 'nav_menu_item';

    /** The API ID RouteDiscovery derives for `wp/v2/menu-items`. */
    private const CORE_API_ID = 'menuItems';

    /**
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    public static function contribute(array $properties, string $apiId): array
    {
        if ($apiId !== self::CORE_API_ID) {
            return $properties;
        }

        $properties['kizlo'] = self::envelope();

        return $properties;
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
}
