<?php

namespace Kizlo\Modules\Registration;

/**
 * Definition for a Kizlo-owned custom taxonomy.
 *
 * Stored under a single option keyed by taxonomy key. {@see toArgs()} maps the
 * definition to register_taxonomy() arguments (the connected object types are
 * passed separately by the registrar). show_in_rest is always forced on.
 */
class TaxonomyRegistration extends RegistrationAbstract
{
    protected const OPTION_KEY = 'kizlo_registrations_taxonomies';

    /** Maximum taxonomy key length WordPress permits. */
    public const KEY_MAX_LENGTH = 32;

    protected array $data = [
        'active'                   => true,
        'key'                      => '',
        'singular_label'           => '',
        'plural_label'             => '',
        'description'              => '',
        'public'                   => true,
        'hierarchical'             => false,
        'labels'                   => [],
        'object_types'             => [],
        'sort'                     => false,
        'default_term_name'        => null,
        'default_term_slug'        => null,
        'default_term_description' => null,
        'show_ui'                  => true,
        'show_in_menu'             => true,
        'meta_box'                 => 'automatic',
        'show_in_nav_menus'        => true,
        'show_tagcloud'            => true,
        'show_in_quick_edit'       => true,
        'show_admin_column'        => false,
        'publicly_queryable'       => true,
    ];

    /**
     * Connected post type keys the taxonomy is registered for.
     *
     * @return string[]
     */
    public function getConnectedPostTypes(): array
    {
        return $this->stringList($this->get('object_types'));
    }

    /**
     * @return array<string, mixed>
     */
    public function toArgs(): array
    {
        $args = [
            'label'              => (string) $this->get('plural_label'),
            'labels'             => $this->buildLabels(),
            'description'        => (string) $this->get('description'),
            'public'             => (bool) $this->get('public'),
            'hierarchical'       => (bool) $this->get('hierarchical'),
            'show_in_rest'       => true,
            'show_ui'            => (bool) $this->get('show_ui'),
            'show_in_menu'       => (bool) $this->get('show_in_menu'),
            'show_in_nav_menus'  => (bool) $this->get('show_in_nav_menus'),
            'show_tagcloud'      => (bool) $this->get('show_tagcloud'),
            'show_in_quick_edit' => (bool) $this->get('show_in_quick_edit'),
            'show_admin_column'  => (bool) $this->get('show_admin_column'),
            'publicly_queryable' => (bool) $this->get('publicly_queryable'),
            'sort'               => (bool) $this->get('sort'),
        ];

        $meta_box = $this->metaBoxArg();
        if ($meta_box !== null) {
            $args['meta_box_cb'] = $meta_box;
        }

        $default_term = $this->defaultTermArg();
        if ($default_term !== null) {
            $args['default_term'] = $default_term;
        }

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
            'name'                       => $p,
            'singular_name'              => $s,
            'menu_name'                  => $p,
            'all_items'                  => $fromPlural("All {$p}"),
            'edit_item'                  => $fromSingular("Edit {$s}"),
            'view_item'                  => $fromSingular("View {$s}"),
            'update_item'                => $fromSingular("Update {$s}"),
            'add_new_item'               => $fromSingular("Add New {$s}"),
            'new_item_name'              => $fromSingular("New {$s} Name"),
            'parent_item'                => $fromSingular("Parent {$s}"),
            'parent_item_colon'          => $fromSingular("Parent {$s}:"),
            'search_items'               => $fromPlural("Search {$p}"),
            'popular_items'              => $fromPlural("Popular {$p}"),
            'separate_items_with_commas' => $fromPlural("Separate {$pl} with commas"),
            'add_or_remove_items'        => $fromPlural("Add or remove {$pl}"),
            'choose_from_most_used'      => $fromPlural("Choose from the most used {$pl}"),
            'not_found'                  => $fromPlural("No {$pl} found."),
            'no_terms'                   => $fromPlural("No {$pl}"),
            'filter_by_item'             => $fromSingular("Filter by {$sl}"),
            'items_list_navigation'      => $fromPlural("{$p} list navigation"),
            'items_list'                 => $fromPlural("{$p} list"),
            'back_to_items'              => $fromPlural("← Go to {$p}"),
            'item_link'                  => $fromSingular("{$s} Link"),
            'item_link_description'      => $fromSingular("A link to a {$sl}."),
        ];
    }

    /**
     * Editor control. `automatic` leaves WordPress to pick the default metabox;
     * the others map to WordPress's built-in category/tag metaboxes or hide it.
     *
     * @return false|string|null
     */
    private function metaBoxArg(): false|string|null
    {
        return match ($this->get('meta_box')) {
            'category' => 'post_categories_meta_box',
            'tag'      => 'post_tags_meta_box',
            'hidden'   => false,
            default    => null,
        };
    }

    /**
     * @return array<string, string>|null
     */
    private function defaultTermArg(): ?array
    {
        $name = $this->get('default_term_name');

        if (empty($name)) {
            return null;
        }

        $term = ['name' => (string) $name];

        if (!empty($this->get('default_term_slug'))) {
            $term['slug'] = (string) $this->get('default_term_slug');
        }

        if (!empty($this->get('default_term_description'))) {
            $term['description'] = (string) $this->get('default_term_description');
        }

        return $term;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'active',
            'public',
            'hierarchical',
            'sort',
            'show_ui',
            'show_in_menu',
            'show_in_nav_menus',
            'show_tagcloud',
            'show_in_quick_edit',
            'show_admin_column',
            'publicly_queryable'       => (bool) $value,

            'key',
            'default_term_slug'        => sanitize_key((string) $value) ?: null,

            'singular_label',
            'plural_label',
            'description',
            'default_term_name',
            'default_term_description' => sanitize_text_field((string) $value),

            'object_types'             => $this->stringList($value),

            'labels'                   => $this->sanitizeLabels($value),

            'meta_box'                 => in_array($value, ['automatic', 'category', 'tag', 'hidden'], true) ? $value : 'automatic',

            default                    => $value,
        };
    }
}
