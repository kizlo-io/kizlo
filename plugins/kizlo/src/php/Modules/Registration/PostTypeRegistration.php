<?php

namespace Kizlo\Modules\Registration;

use Kizlo\Modules\Settings\PostType\PostTypeSettings;

/**
 * Definition for a Kizlo-owned custom post type.
 *
 * Stored under a single option keyed by post type key. {@see toArgs()} maps the
 * definition to register_post_type() arguments. show_in_rest is always forced on
 * and no raw callbacks, controller classes, or meta-cap maps are ever emitted.
 */
class PostTypeRegistration extends RegistrationAbstract
{
    protected const OPTION_KEY = 'kizlo_registrations_post_types';

    /** Maximum post type key length WordPress permits. */
    public const KEY_MAX_LENGTH = 20;

    /**
     * Supports offered to users. The legacy `custom-fields` metabox is
     * intentionally excluded: Kizlo provides its own custom-field system.
     */
    public const SUPPORTS = [
        'title',
        'editor',
        'author',
        'thumbnail',
        'excerpt',
        'comments',
        'revisions',
        'page-attributes',
        'post-formats',
    ];

    protected array $data = [
        'active'              => true,
        'key'                 => '',
        'singular_label'      => '',
        'plural_label'        => '',
        'description'         => '',
        'public'              => true,
        'hierarchical'        => false,
        'labels'              => [],
        'taxonomies'          => [],
        'supports'            => ['title', 'editor'],
        'show_ui'             => true,
        'show_in_menu'        => true,
        'menu_parent'         => null,
        'menu_position'       => null,
        'menu_icon'           => null,
        'show_in_admin_bar'   => true,
        'show_in_nav_menus'   => true,
        'exclude_from_search' => false,
        'publicly_queryable'  => true,
        'rewrite_enabled'     => true,
        'rewrite_slug'        => null,
        'rewrite_with_front'  => true,
        'rewrite_feeds'       => false,
        'rewrite_pages'       => true,
        'archive'             => 'default',
        'archive_slug'        => null,
        'capability_type'     => 'post',
        'capability_singular' => null,
        'capability_plural'   => null,
        'can_export'          => true,
        'delete_with_user'    => false,
        'rest_base'           => null,
    ];

    /**
     * Connected taxonomy keys, so the registrar can wire relationships.
     *
     * @return string[]
     */
    public function getConnectedTaxonomies(): array
    {
        return $this->stringList($this->get('taxonomies'));
    }

    /**
     * Support flags shaped like {@see PostTypeSettings::getSupports()}, derived
     * from the definition rather than the runtime registry (empty when inactive).
     *
     * @return array<string, bool>
     */
    public function getSupportsMap(): array
    {
        $enabled = $this->stringList($this->get('supports'));
        $map     = [];

        foreach (PostTypeSettings::KNOWN_SUPPORTS as $feature) {
            $map[$feature] = in_array($feature, $enabled, true);
        }

        return $map;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArgs(): array
    {
        $args = [
            'label'               => (string) $this->get('plural_label'),
            'labels'              => $this->buildLabels(),
            'description'         => (string) $this->get('description'),
            'public'              => (bool) $this->get('public'),
            'hierarchical'        => (bool) $this->get('hierarchical'),
            'show_in_rest'        => true,
            'supports'            => $this->supportsArg(),
            'taxonomies'          => $this->getConnectedTaxonomies(),
            'show_ui'             => (bool) $this->get('show_ui'),
            'show_in_menu'        => $this->showInMenuArg(),
            'show_in_admin_bar'   => (bool) $this->get('show_in_admin_bar'),
            'show_in_nav_menus'   => (bool) $this->get('show_in_nav_menus'),
            'exclude_from_search' => (bool) $this->get('exclude_from_search'),
            'publicly_queryable'  => (bool) $this->get('publicly_queryable'),
            'has_archive'         => $this->archiveArg(),
            'rewrite'             => $this->rewriteArg(),
            'can_export'          => (bool) $this->get('can_export'),
            'delete_with_user'    => (bool) $this->get('delete_with_user'),
            'map_meta_cap'        => true,
        ];

        if ($this->get('menu_position') !== null) {
            $args['menu_position'] = (int) $this->get('menu_position');
        }

        if (!empty($this->get('menu_icon'))) {
            $args['menu_icon'] = (string) $this->get('menu_icon');
        }

        if (!empty($this->get('rest_base'))) {
            $args['rest_base'] = (string) $this->get('rest_base');
        }

        $args['capability_type'] = $this->capabilityTypeArg();

        return $args;
    }

    /**
     * @return array<string, string>
     */
    protected function generatedLabels(): array
    {
        [$s, $p] = $this->labelNames();
        $sl = strtolower($s);
        $pl = strtolower($p);
        $fromSingular = static fn(string $value): string => $s === '' ? '' : $value;
        $fromPlural = static fn(string $value): string => $p === '' ? '' : $value;

        return [
            'name'                     => $p,
            'singular_name'            => $s,
            'menu_name'                => $p,
            'name_admin_bar'           => $s,
            'add_new'                  => 'Add New',
            'add_new_item'             => $fromSingular("Add New {$s}"),
            'new_item'                 => $fromSingular("New {$s}"),
            'edit_item'                => $fromSingular("Edit {$s}"),
            'view_item'                => $fromSingular("View {$s}"),
            'view_items'               => $fromPlural("View {$p}"),
            'search_items'             => $fromPlural("Search {$p}"),
            'not_found'                => $fromPlural("No {$pl} found."),
            'not_found_in_trash'       => $fromPlural("No {$pl} found in Trash."),
            'parent_item_colon'        => $fromSingular("Parent {$s}:"),
            'all_items'                => $fromPlural("All {$p}"),
            'archives'                 => $fromPlural("{$p} Archives"),
            'attributes'               => $fromSingular("{$s} Attributes"),
            'insert_into_item'         => $fromSingular("Insert into {$sl}"),
            'uploaded_to_this_item'    => $fromSingular("Uploaded to this {$sl}"),
            'filter_items_list'        => $fromPlural("Filter {$pl} list"),
            'items_list_navigation'    => $fromPlural("{$p} list navigation"),
            'items_list'               => $fromPlural("{$p} list"),
            'item_published'           => $fromSingular("{$s} published."),
            'item_published_privately' => $fromSingular("{$s} published privately."),
            'item_reverted_to_draft'   => $fromSingular("{$s} reverted to draft."),
            'item_scheduled'           => $fromSingular("{$s} scheduled."),
            'item_updated'             => $fromSingular("{$s} updated."),
            'item_link'                => $fromSingular("{$s} Link"),
            'item_link_description'    => $fromSingular("A link to a {$sl}."),
        ];
    }

    /**
     * @return string[]
     */
    private function supportsArg(): array
    {
        $supports = array_values(array_intersect($this->stringList($this->get('supports')), self::SUPPORTS));

        return $supports === [] ? ['title'] : $supports;
    }

    /**
     * @return bool|string
     */
    private function showInMenuArg(): bool|string
    {
        if (!$this->get('show_in_menu')) {
            return false;
        }

        $parent = $this->get('menu_parent');

        return !empty($parent) ? (string) $parent : true;
    }

    /**
     * @return bool|string
     */
    private function archiveArg(): bool|string
    {
        return match ($this->get('archive')) {
            'disabled' => false,
            'custom'   => !empty($this->get('archive_slug')) ? (string) $this->get('archive_slug') : true,
            default    => true,
        };
    }

    /**
     * @return array<string, mixed>|false
     */
    private function rewriteArg(): array|false
    {
        $rewrite = $this->baseRewriteArg();

        if ($rewrite === false) {
            return false;
        }

        $rewrite['feeds'] = (bool) $this->get('rewrite_feeds');
        $rewrite['pages'] = (bool) $this->get('rewrite_pages');

        return $rewrite;
    }

    /**
     * @return string|array{0: string, 1: string}
     */
    private function capabilityTypeArg(): string|array
    {
        return match ($this->get('capability_type')) {
            'page'   => 'page',
            'custom' => [
                (string) ($this->get('capability_singular') ?: $this->getKey()),
                (string) ($this->get('capability_plural') ?: (($this->get('capability_singular') ?: $this->getKey()) . 's')),
            ],
            default  => 'post',
        };
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'active',
            'public',
            'hierarchical',
            'show_ui',
            'show_in_menu',
            'show_in_admin_bar',
            'show_in_nav_menus',
            'exclude_from_search',
            'publicly_queryable',
            'rewrite_enabled',
            'rewrite_with_front',
            'rewrite_feeds',
            'rewrite_pages',
            'can_export',
            'delete_with_user'    => (bool) $value,

            'key'                 => sanitize_key((string) $value),

            'singular_label',
            'plural_label',
            'description'         => sanitize_text_field((string) $value),

            'taxonomies',
            'supports'            => $this->stringList($value),

            'labels'              => $this->sanitizeLabels($value),

            'menu_parent',
            'menu_icon',
            'rewrite_slug',
            'archive_slug',
            'capability_singular',
            'capability_plural',
            'rest_base'           => $this->nullableText($value),

            'menu_position'       => ($value === null || $value === '') ? null : (int) $value,

            'archive'             => in_array($value, ['disabled', 'default', 'custom'], true) ? $value : 'default',

            'capability_type'     => in_array($value, ['post', 'page', 'custom'], true) ? $value : 'post',

            default               => $value,
        };
    }
}
