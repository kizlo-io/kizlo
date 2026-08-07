<?php

namespace Kizlo\Modules\Settings;

/**
 * Single source of truth for the settings navigation: menu block → page →
 * sections. The React admin is a pure renderer over this tree; it only resolves
 * icon names to components and renders the served copy.
 *
 * Structure, visibility gates, and per-type section copy (templated with the
 * object's name) all live here. Each section is one sidebar menu item. Icons are
 * emitted as names, resolved client-side by resolveIcon().
 */
class SettingsNav
{
    /**
     * Build the full navigation tree.
     *
     * @param array<int, array<string, mixed>> $postTypes  PostTypeSettingsService::toResponse output.
     * @param array<int, array<string, mixed>> $taxonomies TaxonomySettingsService::toResponse output.
     * @return array<int, array<string, mixed>> NavBlock[].
     */
    public function build(array $postTypes, array $taxonomies): array
    {
        return [
            [
                'label' => 'General',
                'items' => $this->generalPages(),
            ],
            [
                'label' => 'Content',
                'items' => [
                    $this->drillGroup(
                        'post-types',
                        'Post Types',
                        'file-text',
                        '/post-types/new',
                        array_map(fn(array $item): array => $this->postTypePage($item), $postTypes)
                    ),
                    $this->drillGroup(
                        'taxonomies',
                        'Taxonomies',
                        'tag',
                        '/taxonomies/new',
                        array_map(fn(array $item): array => $this->taxonomyPage($item), $taxonomies)
                    ),
                ],
            ],
            [
                'label' => 'System',
                'items' => $this->systemPages(),
            ],
        ];
    }

    // ── Static pages ────────────────────────────────────────────────────────

    /**
     * @return array<int, array<string, mixed>>
     */
    private function generalPages(): array
    {
        return [
            $this->page('general/site', 'Site', '/general/site', 'globe', [
                $this->section('site-identity', 'Site identity', 'Core settings that identify your site to Kizlo and secure communication between the plugin and Kizlo sdk.', 'identification-card'),
                $this->section('site-info', 'Site info', 'Configure your website\'s core details such as name, URL, branding defaults, and search behavior used across metadata and structured data.', 'info'),
                $this->section('seo-defaults', 'SEO Defaults', 'Fallback assets used when a post or page has no SEO image set. Shown when your content is shared on X, Facebook, LinkedIn, and similar platforms.', 'share-network'),
                $this->section('search-visibility', 'Search engine visibility', 'Controls whether search engines are allowed to index your headless frontend.', 'eye'),
            ]),
            $this->page('general/identity', 'Identity', '/general/identity', 'identification-badge', [
                $this->section('identity', 'Identity', 'Select whether this site represents a person or an organization. This determines which structured data (Schema.org) Kizlo outputs and which fields are shown below.', 'identification-card'),
                $this->section('person', 'Person', 'Details about the individual behind this site. Used in Schema.org Person structured data and author metadata across your posts.', 'user'),
                $this->section('organization', 'Organization', 'Core details about your organization. Used in Schema.org Organization structured data across your site.', 'buildings'),
                $this->section('contact-legal', 'Contact & Legal', 'Contact details and legal information. These help search engines and knowledge panels display accurate business info.', 'address-book'),
                $this->section('founder', 'Founder', 'Optionally attribute the organization to a founder. Maps to Schema.org founder and helps Google associate the brand with an individual.', 'user-circle'),
                $this->section('business-identifiers', 'Business Identifiers', 'Registry and tax identifiers. Optional; fill in only what applies to your organization. Each maps to the matching Schema.org property.', 'barcode'),
                $this->section('publishing-policies', 'Publishing & Policies', 'Policy page URLs used mainly by publishers and news sites. Each maps to the matching Schema.org property and helps Google understand your editorial standards.', 'scroll'),
            ]),
            $this->page('general/branding', 'Branding', '/general/branding', 'palette', [
                $this->section('colors', 'Colors', 'The theme color tints the mobile browser chrome and the installed app\'s window; its dark variant is used when the visitor prefers a dark color scheme. The background color fills the app launch screen while it loads.', 'swatches'),
                $this->section('primary-logo', 'Primary logo', 'The full lockup, typically the icon plus the word mark. The dark variant is shown when the visitor prefers a dark color scheme; the light version is used when it\'s empty.', 'image'),
                $this->section('icon', 'Icon', 'The square mark on its own, without the wordmark. Used in tight spaces such as a collapsed header or an avatar.', 'image-square'),
                $this->section('wordmark', 'Wordmark', 'The brand name set as a logotype, without the icon.', 'text-aa'),
                $this->section('favicon', 'Favicon', 'The icon browsers show in tabs and bookmarks. A single icon is used across light and dark browser themes, so choose one that stays legible on both.', 'browser'),
                $this->section('app-icon', 'App icon', 'Used when your site is added to a home screen or installed as an app on any platform. One icon serves them all.', 'device-mobile'),
            ]),
            $this->page('general/authors', 'Authors', '/general/authors', 'users', [
                $this->section('authors', 'Authors', 'Manage the URL structure and SEO configuration for author archive pages, including title templates, meta descriptions, and search visibility.', 'pen-nib'),
                $this->section('seo', 'SEO', 'Control how search engines see and display authors.', 'magnifying-glass'),
            ]),
            $this->page('general/crawling', 'Crawling', '/general/crawling', 'robot', [
                $this->section('sitemap', 'Sitemap', 'Control how your sitemap is exposed to search engines.', 'map-trifold'),
                $this->section('robots', 'Robots', 'Control how search engines crawl your site. These settings are used to generate your robots.txt data.', 'robot'),
            ]),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function systemPages(): array
    {
        return [
            $this->page('system/uploads', 'Uploads', '/system/uploads', 'upload-simple', [
                $this->section('allowed-file-types', 'Allowed File Types', 'Let editors upload file types that WordPress blocks by default, such as SVG logos and ICO favicons. Add each type as a file extension and its matching MIME type. Uploaded SVGs are automatically sanitized to remove scripts and other unsafe content. Executable and script types are refused for security.', 'file-arrow-up'),
            ]),
            $this->page('system/headless', 'Headless', '/system/headless', 'shield', [
                $this->section('headless-mode', 'Headless Mode', 'Shut down or redirect the WordPress surfaces that only exist to display or advertise your WordPress origin. This is the master switch. When it is off, every option below is inert and WordPress behaves natively.', 'power'),
                $this->section('editor-experience', 'Editor experience', 'Redirect the two editor affordances that assume a rendered WordPress site to your headless frontend instead.', 'note-pencil'),
                $this->section('display-routing', 'Display & routing', 'Close down public theme output that a headless setup does not use.', 'signpost'),
                $this->section('search-engine-control', 'Search-engine control', 'Index your headless frontend, not the WordPress backend.', 'magnifying-glass'),
                $this->section('security-hardening', 'Security hardening', 'Shrink the attack and information-leak surface of the WordPress origin.', 'shield-check'),
            ]),
            $this->page('system/webhooks', 'Webhooks', '/system/webhooks', 'webhooks-logo', [
                $this->section('webhook-urls', 'Webhook URLs', 'One or more endpoints that will receive a POST request when triggered content changes. Each URL must be publicly accessible.', 'link'),
                $this->section('triggers', 'Triggers', 'Choose which post types and taxonomies cause a webhook to fire when their content is created, updated, or deleted.', 'lightning'),
            ]),
        ];
    }

    // ── Dynamic pages ───────────────────────────────────────────────────────

    /**
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private function postTypePage(array $item): array
    {
        $name     = (string) ($item['name'] ?? '');
        $slug     = (string) ($item['slug'] ?? '');
        $internal = (bool) ($item['internal'] ?? false);
        $owned    = (bool) ($item['kizlo_owned'] ?? false);
        $active   = (bool) ($item['active'] ?? true);
        $hasReg   = ($item['registration'] ?? null) !== null;

        return [
            'type'     => 'page',
            'id'       => "post-types/{$slug}",
            'name'     => $name,
            'path'     => "/post-types/{$slug}",
            'icon'     => $this->postTypeIcon($slug),
            'inactive' => $owned && ! $active,
            'sections' => $this->postTypeSections($name, $internal, $owned && $hasReg),
            'delete'   => $owned && $hasReg ? $this->deleteCopy($name, 'entries') : null,
        ];
    }

    /**
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private function taxonomyPage(array $item): array
    {
        $name     = (string) ($item['name'] ?? '');
        $slug     = (string) ($item['slug'] ?? '');
        $internal = (bool) ($item['internal'] ?? false);
        $owned    = (bool) ($item['kizlo_owned'] ?? false);
        $active   = (bool) ($item['active'] ?? true);
        $hasReg   = ($item['registration'] ?? null) !== null;

        return [
            'type'     => 'page',
            'id'       => "taxonomies/{$slug}",
            'name'     => $name,
            'path'     => "/taxonomies/{$slug}",
            'icon'     => $this->taxonomyIcon($slug),
            'inactive' => $owned && ! $active,
            'sections' => $this->taxonomySections($name, $internal, $owned && $hasReg),
            'delete'   => $owned && $hasReg ? $this->deleteCopy($name, 'terms') : null,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function postTypeSections(string $name, bool $internal, bool $ownedReg): array
    {
        $lower = $this->lower($name);

        $sections = [];

        // Both owned and core types lead with General. Owned types name and configure
        // the type there; core types have no registration to edit, so General just holds
        // the pathname the type would otherwise expose as a standalone URL Structure section.
        if ($ownedReg) {
            $sections[] = $this->section('general', 'General', 'How this post type is named and how its entries behave.', 'squares-four');
        } else {
            $sections[] = $this->section('general', 'General', "Defines the URL pattern for {$lower}. The resolved path is used across canonical links, SEO meta tags, structured data, and the preview link inside the {$lower} editor.", 'squares-four');
        }

        $sections[] = $this->section('fields', 'Fields', "Custom fields and editor settings for {$lower}.", 'note-pencil');
        $sections[] = $this->section('seo', 'SEO', "Control how search engines see and display {$lower}.", 'magnifying-glass');

        // Owned types manage API access inside Advanced; core types keep a standalone REST API section.
        if ($ownedReg) {
            $sections[] = $this->section('advanced', 'Advanced', 'Less-common options and destructive actions. Most sites can leave these alone.', 'gear-six');
        } elseif (! $internal) {
            $sections[] = $this->section('api', 'REST API', "Defines who and how {$lower} type can be accessed through the REST API.", 'share-network');
        }

        return $sections;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function taxonomySections(string $name, bool $internal, bool $ownedReg): array
    {
        $lower = $this->lower($name);

        $sections = [];

        // Mirrors the post-type structure: General → Fields → SEO → Advanced. Owned
        // taxonomies fold their wp-admin options and labels into General/Advanced rather
        // than a separate WordPress admin section. Core taxonomies use General for the
        // pathname and keep a standalone REST API section.
        if ($ownedReg) {
            $sections[] = $this->section('general', 'General', 'How this taxonomy is named and how its terms behave.', 'squares-four');
        } else {
            $sections[] = $this->section('general', 'General', "Defines the URL pattern for {$lower}. The resolved path is used across canonical links, SEO meta tags, structured data, and the preview link inside the {$lower} editor.", 'squares-four');
        }

        $sections[] = $this->section('fields', 'Fields', "Custom fields and content settings for {$lower}.", 'note-pencil');
        $sections[] = $this->section('seo', 'SEO', "Control how search engines see and display {$lower}.", 'magnifying-glass');

        if ($ownedReg) {
            $sections[] = $this->section('advanced', 'Advanced', 'Less-common options and destructive actions. Most sites can leave these alone.', 'gear-six');
        } elseif (! $internal) {
            $sections[] = $this->section('api', 'REST API', "Defines who and how {$lower} type can be accessed through the REST API.", 'share-network');
        }

        return $sections;
    }

    private function postTypeIcon(string $slug): string
    {
        return match ($slug) {
            'post'       => 'article',
            'page'       => 'file',
            'attachment' => 'image',
            default      => 'file-text',
        };
    }

    private function taxonomyIcon(string $slug): string
    {
        return match ($slug) {
            'category' => 'folder',
            'post_tag' => 'hash',
            default    => 'tag',
        };
    }

    // ── Builders ────────────────────────────────────────────────────────────

    /**
     * A drill-down group in the sidebar root (Post Types, Taxonomies).
     *
     * @param array<int, array<string, mixed>> $items
     * @return array<string, mixed>
     */
    private function drillGroup(string $id, string $name, string $icon, string $onCreate, array $items): array
    {
        return [
            'type'     => 'group',
            'id'       => $id,
            'name'     => $name,
            'icon'     => $icon,
            'onCreate' => $onCreate,
            'items'    => $items,
        ];
    }

    /**
     * A settings page whose sections are the sidebar jump-links (menu items).
     *
     * @param array<int, array<string, mixed>> $sections
     * @return array<string, mixed>
     */
    private function page(string $id, string $name, string $path, string $icon, array $sections): array
    {
        return [
            'type'     => 'page',
            'id'       => $id,
            'name'     => $name,
            'path'     => $path,
            'icon'     => $icon,
            'sections' => $sections,
        ];
    }

    /**
     * Copy for a page's delete card, templated with the object's name. `label`
     * heads the card and its trigger button; `desc` explains the action.
     *
     * @param string $name The object's plural label, e.g. "Books".
     * @param string $noun What its items are called, e.g. "entries" or "terms".
     * @return array<string, string>
     */
    private function deleteCopy(string $name, string $noun): array
    {
        return [
            'label' => "Delete {$name}",
            'desc'  => "Permanently remove {$name} from WordPress. There is no trash — you choose whether to keep or delete its {$noun}.",
        ];
    }

    /**
     * @return array<string, string>
     */
    private function section(string $id, string $title, string $desc, string $icon): array
    {
        return [
            'id'    => $id,
            'title' => $title,
            'desc'  => wp_kses_post($desc),
            'icon'  => $icon,
        ];
    }

    private function lower(string $name): string
    {
        return function_exists('mb_strtolower') ? mb_strtolower($name) : strtolower($name);
    }
}
