<?php

namespace Kizlo\Modules\Settings;

use Kizlo\Modules\CustomFields\FieldDefinitions;
use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Settings\Identity\IdentitySettings;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use Kizlo\Modules\Settings\Site\SiteSettings;

/**
 * The settings surface, as a set of registered contract schemas.
 *
 * Every section is described once here and referenced twice: `GET /settings`
 * returns all of them together, and each section's own `PUT` returns the one it
 * writes. Declaring the shape inside either route would leave the other free to
 * drift, which is the failure the contract exists to rule out.
 *
 * Shapes are taken from the code that builds the responses, meaning each
 * `SettingsAbstract` subclass's `$data` and the `toResponse()` on its service,
 * not from the WordPress option or the admin form. Where a service expands a
 * stored attachment ID through `kizlo_ensure_media_data()`, the response
 * property is `kizlo.media` and the matching input property is the integer ID
 * that was stored.
 *
 * The `nav` key {@see SettingsModule} attaches for the plugin admin is
 * deliberately absent. It is gated behind an internal query flag no SDK caller
 * sends, and publishing it would put an admin-only tree in every generated
 * client.
 *
 * Published through {@see CoreSchemas::all()}, which is what makes them core
 * schemas rather than a contribution: a settings route resolves these while its
 * arguments are being built, on requests that have nothing to do with settings.
 */
final class SettingsSchemas
{
    public const SETTINGS     = 'kizlo.settings';
    public const SITE         = 'kizlo.settings-site';
    public const BRAND        = 'kizlo.settings-brand';
    public const IDENTITY     = 'kizlo.settings-identity';
    public const PERSON       = 'kizlo.settings-person';
    public const ORGANIZATION = 'kizlo.settings-organization';
    public const AUTHORS      = 'kizlo.settings-authors';
    public const POST_TYPE    = 'kizlo.settings-post-type';
    public const TAXONOMY     = 'kizlo.settings-taxonomy';
    public const CRAWLING     = 'kizlo.settings-crawling';
    public const WEBHOOK      = 'kizlo.settings-webhook';
    public const UPLOADS      = 'kizlo.settings-uploads';
    public const HEADLESS     = 'kizlo.settings-headless';

    public const SOCIAL_PROFILE       = 'kizlo.social-profile';
    public const FOUNDER              = 'kizlo.organization-founder';
    public const VARIABLE             = 'kizlo.variable';
    public const CUSTOM_FIELD         = 'kizlo.custom-field';
    public const CUSTOM_FIELD_BASE    = 'kizlo.custom-field-base';
    public const POST_STATUS_DETAIL   = 'kizlo.post-status-definition';
    public const POST_TYPE_DEFINITION = 'kizlo.post-type-registration';
    public const TAXONOMY_DEFINITION  = 'kizlo.taxonomy-registration';
    public const UPLOAD_MIME          = 'kizlo.upload-mime';
    public const ROBOTS_RULE          = 'kizlo.robots-rule';
    public const DELETE_PROGRESS      = 'kizlo.definition-delete-progress';
    public const DELETE_RESULT        = 'kizlo.definition-delete-result';
    public const DEFINITION_CREATED   = 'kizlo.definition-created';
    public const DEFINITION_ACTIVE    = 'kizlo.definition-active';

    /**
     * A section's properties as a partial write: the same shape it reads back,
     * with each top-level key optional.
     *
     * Only sections whose write surface is exactly their read surface use this.
     * Anything that stores an attachment ID it reads back expanded, or nests an
     * object that is itself written partially, declares its own input beside the
     * route that accepts it.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function optionalProperties(string $id): array
    {
        /** @var array<string, array<string, mixed>> $properties */
        $properties = self::all()[$id]['properties'] ?? [];

        foreach ($properties as $name => $property) {
            unset($properties[$name]['required']);
        }

        return $properties;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            self::SOCIAL_PROFILE       => self::socialProfile(),
            self::FOUNDER              => self::founder(),
            self::VARIABLE             => self::variable(),
            self::CUSTOM_FIELD_BASE    => self::customFieldBase(),
            self::CUSTOM_FIELD         => self::customField(),
            self::POST_STATUS_DETAIL   => self::postStatusDefinition(),
            self::POST_TYPE_DEFINITION => self::postTypeDefinition(),
            self::TAXONOMY_DEFINITION  => self::taxonomyDefinition(),
            self::UPLOAD_MIME          => self::uploadMime(),
            self::ROBOTS_RULE          => self::robotsRule(),
            self::DELETE_PROGRESS      => self::deleteProgress(),
            self::DELETE_RESULT        => self::deleteResult(),
            self::DEFINITION_CREATED   => self::definitionCreated(),
            self::DEFINITION_ACTIVE    => self::definitionActive(),

            self::SITE         => self::site(),
            self::BRAND        => self::brand(),
            self::PERSON       => self::person(),
            self::ORGANIZATION => self::organization(),
            self::IDENTITY     => self::identity(),
            self::AUTHORS      => self::authors(),
            self::POST_TYPE    => self::postType(),
            self::TAXONOMY     => self::taxonomy(),
            self::CRAWLING     => self::crawling(),
            self::WEBHOOK      => self::webhook(),
            self::UPLOADS      => self::uploads(),
            self::HEADLESS     => self::headless(),
            self::SETTINGS     => self::settings(),
        ];
    }

    // ============================================================
    // SECTIONS
    // ============================================================

    /**
     * @return array<string, mixed>
     */
    private static function settings(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Every Kizlo settings section, as returned by GET /settings.',
            'properties'  => [
                'site'             => ['$ref' => self::SITE, 'required' => true],
                'brand'            => ['$ref' => self::BRAND, 'required' => true],
                'identity'         => ['$ref' => self::IDENTITY, 'required' => true],
                'authors'          => ['$ref' => self::AUTHORS, 'required' => true],
                'post_types'       => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::POST_TYPE]],
                'taxonomies'       => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::TAXONOMY]],
                'crawling'         => ['$ref' => self::CRAWLING, 'required' => true],
                'webhook'          => ['$ref' => self::WEBHOOK, 'required' => true],
                'uploads'          => ['$ref' => self::UPLOADS, 'required' => true],
                'headless'         => ['$ref' => self::HEADLESS, 'required' => true],
                'plain_permalinks' => [
                    'type'        => 'boolean',
                    'required'    => true,
                    'description' => 'True when WordPress is on plain permalinks, which Kizlo routes cannot serve pretty URLs behind.',
                ],
                'statuses'         => [
                    'type'        => 'array',
                    'required'    => true,
                    'description' => 'Every registered post status, plugin-registered ones included.',
                    'items'       => ['$ref' => self::POST_STATUS_DETAIL],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function site(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Identity and defaults for the site itself.',
            'properties'  => [
                'url'                       => ['type' => 'string', 'required' => true, 'nullable' => true, 'format' => 'uri', 'description' => 'Public frontend URL.'],
                'backend_url'               => ['type' => 'string', 'required' => true, 'nullable' => true, 'format' => 'uri', 'description' => 'WordPress URL, when it differs from the frontend.'],
                'secret'                    => ['type' => 'string', 'required' => true, 'nullable' => true, 'description' => 'Shared secret used to sign webhook deliveries.'],
                'name'                      => ['type' => 'string', 'required' => true, 'nullable' => true],
                'alternate_name'            => ['type' => 'string', 'required' => true, 'nullable' => true],
                'tagline'                   => ['type' => 'string', 'required' => true, 'nullable' => true],
                'title_separator'           => ['type' => 'string', 'required' => true, 'enum' => SiteSettings::TITLE_SEPARATORS],
                'fallback_image'            => ['$ref' => CoreSchemas::MEDIA, 'required' => true, 'nullable' => true],
                'search_action_structure'   => ['type' => 'string', 'required' => true, 'nullable' => true, 'description' => 'Search URL template published in the site JSON-LD.'],
                'discourage_search_engines' => ['type' => 'boolean', 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function brand(): array
    {
        $properties = [];

        foreach (['logo', 'logo_dark', 'logo_icon', 'logo_icon_dark', 'logo_wordmark', 'logo_wordmark_dark', 'favicon', 'app_icon'] as $key) {
            $properties[$key] = ['$ref' => CoreSchemas::MEDIA, 'required' => true, 'nullable' => true];
        }

        foreach (['theme_color', 'theme_color_dark', 'background_color'] as $key) {
            $properties[$key] = ['type' => 'string', 'required' => true, 'nullable' => true, 'description' => 'Hex color.'];
        }

        return [
            'type'        => 'object',
            'description' => 'Brand assets and colors the headless frontend renders.',
            'properties'  => $properties,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function identity(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Who the site represents. Both nodes are always returned; `type` selects the published one.',
            'properties'  => [
                'type'         => ['type' => 'string', 'required' => true, 'enum' => IdentitySettings::IDENTITY_TYPES],
                'person'       => ['$ref' => self::PERSON, 'required' => true],
                'organization' => ['$ref' => self::ORGANIZATION, 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function person(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'user_id'         => ['type' => 'integer', 'required' => true, 'nullable' => true, 'description' => 'WordPress user the person node derives its name and description from.'],
                'image'           => ['$ref' => CoreSchemas::MEDIA, 'required' => true, 'nullable' => true],
                'social_profiles' => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::SOCIAL_PROFILE]],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function organization(): array
    {
        $strings = [
            'name',
            'alternate_name',
            'slogan',
            'description',
            'email',
            'phone',
            'legal_name',
            'founding_date',
            'vat_id',
            'tax_id',
            'iso6523_code',
            'duns',
            'lei_code',
            'naics',
            'publishing_principles',
            'ownership_funding_info',
            'actionable_feedback_policy',
            'corrections_policy',
            'ethics_policy',
            'diversity_policy',
            'diversity_staffing_report',
        ];

        $properties = [];

        foreach ($strings as $key) {
            $properties[$key] = ['type' => 'string', 'required' => true, 'nullable' => true];
        }

        $properties['founder']         = ['$ref' => self::FOUNDER, 'required' => true, 'nullable' => true];
        $properties['employees_min']   = ['type' => 'integer', 'required' => true, 'nullable' => true];
        $properties['employees_max']   = ['type' => 'integer', 'required' => true, 'nullable' => true];
        $properties['logo']            = ['$ref' => CoreSchemas::MEDIA, 'required' => true, 'nullable' => true];
        $properties['social_profiles'] = ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::SOCIAL_PROFILE]];

        return [
            'type'        => 'object',
            'description' => 'The organization node published in the site JSON-LD.',
            'properties'  => $properties,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function authors(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Author archive behavior and the SEO applied to it.',
            'properties'  => [
                'enabled'                  => ['type' => 'boolean', 'required' => true],
                'pathname_structure'       => ['type' => 'string', 'required' => true, 'nullable' => true],
                'title_structure'          => ['type' => 'string', 'required' => true, 'nullable' => true],
                'description_structure'    => ['type' => 'string', 'required' => true, 'nullable' => true],
                'search_engine_visibility' => ['type' => 'boolean', 'required' => true, 'nullable' => true],
                'breadcrumbs'              => self::breadcrumbs(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function postType(): array
    {
        return [
            'type'        => 'object',
            'description' => 'A post type available to Kizlo, merging its WordPress metadata with the Kizlo settings saved against it.',
            'properties'  => [
                'name'                     => ['type' => 'string', 'required' => true, 'description' => 'Plural label.'],
                'slug'                     => ['type' => 'string', 'required' => true],
                'hierarchical'             => ['type' => 'boolean', 'required' => true],
                'supports'                 => self::supports(),
                'internal'                 => ['type' => 'boolean', 'required' => true, 'description' => 'True for the types Kizlo treats as built in, which cannot be deleted.'],
                'content_variables'        => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::VARIABLE]],
                'kizlo_owned'              => ['type' => 'boolean', 'required' => true, 'description' => 'True when Kizlo owns the WordPress registration and can edit it.'],
                'active'                   => ['type' => 'boolean', 'required' => true, 'description' => 'Whether the type is registered with WordPress. Always true for types Kizlo does not own.'],
                'registration'             => ['$ref' => self::POST_TYPE_DEFINITION, 'required' => true, 'nullable' => true, 'description' => 'Null unless `kizlo_owned`.'],
                'pathname_structure'       => ['type' => 'string', 'required' => true, 'nullable' => true],
                'title_structure'          => ['type' => 'string', 'required' => true, 'nullable' => true],
                'description_structure'    => ['type' => 'string', 'required' => true, 'nullable' => true],
                'search_engine_visibility' => ['type' => 'boolean', 'required' => true, 'nullable' => true],
                'webpage_type'             => ['type' => 'string', 'required' => true, 'description' => 'schema.org WebPage subtype.'],
                'article_type'             => ['type' => 'string', 'required' => true, 'nullable' => true, 'description' => 'schema.org Article subtype, or "none" to publish no Article node.'],
                'comment_action_structure' => ['type' => 'string', 'required' => true, 'nullable' => true],
                'seo_enabled'              => ['type' => 'boolean', 'required' => true, 'nullable' => true],
                'rest_api_enabled'         => ['type' => 'boolean', 'required' => true],
                'breadcrumbs'              => self::breadcrumbs(),
                'custom_fields'            => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::CUSTOM_FIELD]],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function taxonomy(): array
    {
        return [
            'type'        => 'object',
            'description' => 'A taxonomy available to Kizlo, merging its WordPress metadata with the Kizlo settings saved against it.',
            'properties'  => [
                'name'                     => ['type' => 'string', 'required' => true, 'description' => 'Plural label.'],
                'slug'                     => ['type' => 'string', 'required' => true],
                'hierarchical'             => ['type' => 'boolean', 'required' => true],
                'internal'                 => ['type' => 'boolean', 'required' => true, 'description' => 'True for the taxonomies Kizlo treats as built in, which cannot be deleted.'],
                'kizlo_owned'              => ['type' => 'boolean', 'required' => true, 'description' => 'True when Kizlo owns the WordPress registration and can edit it.'],
                'active'                   => ['type' => 'boolean', 'required' => true, 'description' => 'Whether the taxonomy is registered with WordPress. Always true for taxonomies Kizlo does not own.'],
                'registration'             => ['$ref' => self::TAXONOMY_DEFINITION, 'required' => true, 'nullable' => true, 'description' => 'Null unless `kizlo_owned`.'],
                'pathname_structure'       => ['type' => 'string', 'required' => true, 'nullable' => true],
                'title_structure'          => ['type' => 'string', 'required' => true, 'nullable' => true],
                'description_structure'    => ['type' => 'string', 'required' => true, 'nullable' => true],
                'search_engine_visibility' => ['type' => 'boolean', 'required' => true, 'nullable' => true],
                'seo_enabled'              => ['type' => 'boolean', 'required' => true, 'nullable' => true],
                'rest_api_enabled'         => ['type' => 'boolean', 'required' => true],
                'breadcrumbs'              => self::breadcrumbs(),
                'custom_fields'            => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::CUSTOM_FIELD]],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function crawling(): array
    {
        return [
            'type'        => 'object',
            'description' => 'What Kizlo publishes at robots.txt.',
            'properties'  => [
                'robots' => [
                    'type'       => 'object',
                    'required'   => true,
                    'properties' => [
                        'include_sitemap' => ['type' => 'boolean', 'required' => true],
                        'custom_rules'    => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::ROBOTS_RULE]],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function webhook(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Where Kizlo delivers events, and which content changes fire them.',
            'properties'  => [
                'post_types'   => [
                    'type'        => 'array',
                    'required'    => true,
                    'description' => 'Effective watched post type slugs, with the stored allow and deny lists already applied to the defaults.',
                    'items'       => ['type' => 'string'],
                ],
                'taxonomies'   => [
                    'type'        => 'array',
                    'required'    => true,
                    'description' => 'Effective watched taxonomy slugs, resolved the same way.',
                    'items'       => ['type' => 'string'],
                ],
                'webhook_urls' => ['type' => 'array', 'required' => true, 'items' => ['type' => 'string', 'format' => 'uri']],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function uploads(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Upload types enabled beyond the WordPress defaults.',
            'properties'  => [
                'allowed_mimes' => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::UPLOAD_MIME]],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function headless(): array
    {
        $flags = [
            'enabled'                   => 'Master switch. The rest apply only while this is on.',
            'preview'                   => 'Route the admin preview to the headless frontend.',
            'view_links'                => 'Point admin view links at the headless frontend.',
            'block_indexing'            => 'Ask search engines not to index the WordPress origin.',
            'frontend_lockout'          => 'Refuse frontend requests to WordPress.',
            'frontend_lockout_redirect' => 'Redirect locked-out frontend requests to the headless frontend.',
            'disable_feeds'             => 'Disable RSS and Atom feeds.',
            'disable_embeds'            => 'Disable oEmbed discovery and the embed endpoint.',
            'disable_xmlrpc'            => 'Disable XML-RPC.',
            'block_enumeration'         => 'Block author enumeration.',
            'clean_head'                => 'Remove the generator, shortlink and RSD tags from wp_head.',
            'disable_file_editor'       => 'Disable the plugin and theme file editors.',
            'disable_pingbacks'         => 'Disable pingbacks and trackbacks.',
            'rename_login'              => 'Serve the login form from `login_slug` instead of wp-login.php.',
        ];

        $properties = [];

        foreach ($flags as $key => $description) {
            $properties[$key] = ['type' => 'boolean', 'required' => true, 'description' => $description];
        }

        $properties['login_slug'] = [
            'type'        => 'string',
            'required'    => true,
            'nullable'    => true,
            'description' => 'Null while `rename_login` is off, or when the requested slug was reserved.',
        ];

        return [
            'type'        => 'object',
            'description' => 'What WordPress stops doing once it runs behind a headless frontend.',
            'properties'  => $properties,
        ];
    }

    // ============================================================
    // SHARED PIECES
    // ============================================================

    /**
     * @return array<string, mixed>
     */
    private static function socialProfile(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'url'      => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                'platform' => ['type' => 'string', 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function founder(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'name'            => ['type' => 'string', 'required' => true],
                'social_profiles' => ['type' => 'array', 'required' => true, 'items' => ['$ref' => self::SOCIAL_PROFILE]],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function variable(): array
    {
        return [
            'type'        => 'object',
            'description' => 'A placeholder accepted in the title, description and pathname structures.',
            'properties'  => [
                'value'       => ['type' => 'string', 'required' => true],
                'label'       => ['type' => 'string', 'required' => true],
                'description' => ['type' => 'string', 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function uploadMime(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'ext'  => ['type' => 'string', 'required' => true],
                'mime' => ['type' => 'string', 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function robotsRule(): array
    {
        return [
            'type'        => 'object',
            'description' => 'A single robots.txt directive. SeoBase groups them by user agent when it renders the file.',
            'properties'  => [
                'user_agent' => ['type' => 'string', 'required' => true],
                'rule'       => ['type' => 'string', 'required' => true, 'enum' => ['allow', 'disallow']],
                'path'       => ['type' => 'string', 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function postStatusDefinition(): array
    {
        return [
            'type'        => 'object',
            'description' => 'A registered post status and its access flags.',
            'properties'  => [
                'label'     => ['type' => 'string', 'required' => true],
                'slug'      => ['type' => 'string', 'required' => true],
                'public'    => ['type' => 'boolean', 'required' => true],
                'private'   => ['type' => 'boolean', 'required' => true],
                'internal'  => ['type' => 'boolean', 'required' => true],
                'protected' => ['type' => 'boolean', 'required' => true],
            ],
        ];
    }

    /**
     * Breadcrumb rows are a page ID or the `__parent__` token, in order.
     *
     * @return array<string, mixed>
     */
    private static function breadcrumbs(): array
    {
        return ['required' => true] + self::breadcrumbsInput();
    }

    /**
     * The same list as a write. Public because three routes accept it and one
     * vocabulary of row tokens is the point.
     *
     * @return array<string, mixed>
     */
    public static function breadcrumbsInput(): array
    {
        return [
            'type'        => 'array',
            'description' => 'Ordered breadcrumb rows between the home crumb and the item.',
            'items'       => [
                'anyOf' => [
                    ['type' => 'integer', 'description' => 'A page ID.'],
                    ['type' => 'string', 'enum' => ['__parent__'], 'description' => 'The item\'s own parent, resolved per request.'],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function supports(): array
    {
        $properties = [];

        foreach (PostTypeSettings::KNOWN_SUPPORTS as $feature) {
            $properties[$feature] = ['type' => 'boolean', 'required' => true];
        }

        return [
            'type'        => 'object',
            'required'    => true,
            'description' => 'Which editor features the type has enabled.',
            'properties'  => $properties,
        ];
    }

    // ============================================================
    // CUSTOM FIELD DEFINITIONS
    // ============================================================

    /**
     * @return array<string, mixed>
     */
    private static function customFieldBase(): array
    {
        return [
            'type'        => 'object',
            'description' => 'What every custom field definition carries, whatever its type.',
            'properties'  => [
                'key'          => ['type' => 'string', 'required' => true, 'description' => 'Generated identifier, e.g. `field_a1b2c3`. Never changes once created.'],
                'name'         => ['type' => 'string', 'required' => true, 'description' => 'Meta-key segment. Locked to its first saved value.'],
                'label'        => ['type' => 'string', 'required' => true],
                'instructions' => ['type' => 'string', 'required' => true],
                'required'     => ['type' => 'boolean', 'required' => true, 'description' => 'Whether a value must be supplied when writing an entry.'],
            ],
        ];
    }

    /**
     * A custom field definition, discriminated by `type`.
     *
     * Types sharing a configuration share a member rather than getting one each,
     * so `text`, `textarea`, `richtext`, `url`, `email` and `date` arrive as a
     * single member with a six-value `type` enum. {@see FieldDefinitions::normalizeConfig()}
     * is what decides which keys a type stores, and it treats those six the same.
     *
     * `group` and `repeater` nest this schema through `$ref`, which resolves as
     * far as it is used and no further.
     *
     * @return array<string, mixed>
     */
    private static function customField(): array
    {
        return [
            'description' => 'A stored custom field definition.',
            'anyOf'       => [
                self::fieldMember(['text', 'textarea', 'richtext', 'url', 'email', 'date'], [
                    'default' => ['type' => 'string', 'required' => true, 'nullable' => true],
                ]),
                self::fieldMember(['number'], [
                    'default' => ['type' => 'number', 'required' => true, 'nullable' => true],
                    'min'     => ['type' => 'number', 'required' => true, 'nullable' => true],
                    'max'     => ['type' => 'number', 'required' => true, 'nullable' => true],
                    'step'    => ['type' => 'number', 'required' => true, 'nullable' => true],
                ]),
                self::fieldMember(['toggle'], [
                    'default' => ['type' => 'boolean', 'required' => true],
                ]),
                self::fieldMember(['select'], [
                    'choices' => self::choices(),
                    'default' => ['type' => 'string', 'required' => true, 'nullable' => true],
                ]),
                self::fieldMember(['multiselect'], [
                    'choices' => self::choices(),
                    'default' => ['type' => 'array', 'required' => true, 'items' => ['type' => 'string']],
                ]),
                self::fieldMember(['image', 'file'], []),
                self::fieldMember(['group'], [
                    'fields' => self::nestedFields(),
                ]),
                self::fieldMember(['repeater'], [
                    'fields' => self::nestedFields(),
                    'min'    => ['type' => 'integer', 'required' => true, 'nullable' => true, 'description' => 'Minimum rows. Null is unbounded.'],
                    'max'    => ['type' => 'integer', 'required' => true, 'nullable' => true, 'description' => 'Maximum rows. Null is unbounded.'],
                ]),
            ],
        ];
    }

    /**
     * @param array<int, string>                $types
     * @param array<string, array<string, mixed>> $properties
     * @return array<string, mixed>
     */
    private static function fieldMember(array $types, array $properties): array
    {
        return [
            '$extends'   => self::CUSTOM_FIELD_BASE,
            'type'       => 'object',
            'properties' => ['type' => ['type' => 'string', 'required' => true, 'enum' => $types]] + $properties,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function choices(): array
    {
        return [
            'type'       => 'array',
            'required'   => true,
            'items'      => [
                'type'       => 'object',
                'properties' => [
                    'value' => ['type' => 'string', 'required' => true],
                    'label' => ['type' => 'string', 'required' => true],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function nestedFields(): array
    {
        return [
            'type'        => 'array',
            'required'    => true,
            'description' => 'Child definitions, nested to any depth.',
            'items'       => ['$ref' => self::CUSTOM_FIELD],
        ];
    }

    // ============================================================
    // REGISTRATIONS
    // ============================================================

    /**
     * @return array<string, mixed>
     */
    private static function postTypeDefinition(): array
    {
        return [
            'type'        => 'object',
            'description' => 'The editable WordPress registration behind a Kizlo-owned post type.',
            'properties'  => [
                'active'              => ['type' => 'boolean', 'required' => true],
                'key'                 => ['type' => 'string', 'required' => true, 'description' => 'Registration key. Generated on creation and immutable afterward.'],
                'singular_label'      => ['type' => 'string', 'required' => true],
                'plural_label'        => ['type' => 'string', 'required' => true],
                'description'         => ['type' => 'string', 'required' => true],
                'public'              => ['type' => 'boolean', 'required' => true],
                'hierarchical'        => ['type' => 'boolean', 'required' => true],
                'labels'              => self::labelOverrides(),
                'taxonomies'          => ['type' => 'array', 'required' => true, 'description' => 'Connected taxonomy keys.', 'items' => ['type' => 'string']],
                'supports'            => ['type' => 'array', 'required' => true, 'description' => 'Enabled editor supports.', 'items' => ['type' => 'string']],
                'show_ui'             => ['type' => 'boolean', 'required' => true],
                'show_in_menu'        => ['type' => 'boolean', 'required' => true],
                'menu_parent'         => ['type' => 'string', 'required' => true, 'nullable' => true],
                'menu_position'       => ['type' => 'integer', 'required' => true, 'nullable' => true],
                'menu_icon'           => ['type' => 'string', 'required' => true, 'nullable' => true],
                'show_in_admin_bar'   => ['type' => 'boolean', 'required' => true],
                'show_in_nav_menus'   => ['type' => 'boolean', 'required' => true],
                'exclude_from_search' => ['type' => 'boolean', 'required' => true],
                'publicly_queryable'  => ['type' => 'boolean', 'required' => true],
                'capability_type'     => ['type' => 'string', 'required' => true, 'enum' => ['post', 'page', 'custom']],
                'capability_singular' => ['type' => 'string', 'required' => true, 'nullable' => true],
                'capability_plural'   => ['type' => 'string', 'required' => true, 'nullable' => true],
                'can_export'          => ['type' => 'boolean', 'required' => true],
                'delete_with_user'    => ['type' => 'boolean', 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function taxonomyDefinition(): array
    {
        return [
            'type'        => 'object',
            'description' => 'The editable WordPress registration behind a Kizlo-owned taxonomy.',
            'properties'  => [
                'active'                   => ['type' => 'boolean', 'required' => true],
                'key'                      => ['type' => 'string', 'required' => true, 'description' => 'Registration key. Generated on creation and immutable afterward.'],
                'singular_label'           => ['type' => 'string', 'required' => true],
                'plural_label'             => ['type' => 'string', 'required' => true],
                'description'              => ['type' => 'string', 'required' => true],
                'public'                   => ['type' => 'boolean', 'required' => true],
                'hierarchical'             => ['type' => 'boolean', 'required' => true],
                'labels'                   => self::labelOverrides(),
                'object_types'             => ['type' => 'array', 'required' => true, 'description' => 'Connected post type keys.', 'items' => ['type' => 'string']],
                'sort'                     => ['type' => 'boolean', 'required' => true],
                'default_term_name'        => ['type' => 'string', 'required' => true, 'nullable' => true],
                'default_term_slug'        => ['type' => 'string', 'required' => true, 'nullable' => true],
                'default_term_description' => ['type' => 'string', 'required' => true, 'nullable' => true],
                'show_ui'                  => ['type' => 'boolean', 'required' => true],
                'show_in_menu'             => ['type' => 'boolean', 'required' => true],
                'meta_box'                 => ['type' => 'string', 'required' => true, 'enum' => ['automatic', 'category', 'tag', 'hidden']],
                'show_in_nav_menus'        => ['type' => 'boolean', 'required' => true],
                'show_tagcloud'            => ['type' => 'boolean', 'required' => true],
                'show_in_quick_edit'       => ['type' => 'boolean', 'required' => true],
                'show_admin_column'        => ['type' => 'boolean', 'required' => true],
                'publicly_queryable'       => ['type' => 'boolean', 'required' => true],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function labelOverrides(): array
    {
        return [
            'type'                 => 'object',
            'required'             => true,
            'description'          => 'Individual WordPress label overrides. Unset labels are generated from the singular and plural.',
            'additionalProperties' => ['type' => 'string'],
        ];
    }

    /**
     * The resumable delete job, reported by every route that advances one.
     *
     * @return array<string, mixed>
     */
    private static function deleteProgress(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Progress of a running item deletion.',
            'properties'  => self::progressProperties(),
        ];
    }

    /**
     * What `POST /settings/{kind}/{slug}/delete` answers.
     *
     * In `keep_items` mode the definition is unregistered on the spot and the
     * call is over, so only the four job fields come back. In `delete_items`
     * mode the items drain in batches and the progress fields come with it, to
     * be advanced through the process and retry routes.
     *
     * @return array<string, mixed>
     */
    private static function deleteResult(): array
    {
        $progress = self::progressProperties();

        foreach ($progress as $name => $property) {
            unset($progress[$name]['required']);
            $progress[$name]['description'] = 'Present in "delete_items" mode only.';
        }

        return [
            'type'        => 'object',
            'description' => 'The outcome of starting a definition delete.',
            'properties'  => [
                'slug'     => ['type' => 'string', 'required' => true],
                'kind'     => self::deleteKind(),
                'mode'     => ['type' => 'string', 'required' => true, 'enum' => ['keep_items', 'delete_items']],
                'complete' => ['type' => 'boolean', 'required' => true],
            ] + $progress,
        ];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function progressProperties(): array
    {
        return [
            'slug'      => ['type' => 'string', 'required' => true],
            'kind'      => ['type' => 'string', 'required' => true, 'enum' => ['post_type', 'taxonomy']],
            'total'     => ['type' => 'integer', 'required' => true],
            'deleted'   => ['type' => 'integer', 'required' => true],
            'failed'    => ['type' => 'integer', 'required' => true, 'description' => 'How many items could not be deleted and are waiting on a retry.'],
            'remaining' => ['type' => 'integer', 'required' => true],
            'status'    => ['type' => 'string', 'required' => true, 'enum' => ['processing', 'complete', 'failed']],
            'complete'  => ['type' => 'boolean', 'required' => true],
        ];
    }

    /**
     * The delete route reports whichever vocabulary its mode produced: the
     * settings kind when the definition goes immediately, the item kind once a
     * drain job owns the response.
     *
     * @return array<string, mixed>
     */
    private static function deleteKind(): array
    {
        return [
            'type'        => 'string',
            'required'    => true,
            'enum'        => ['post_types', 'taxonomies', 'post_type', 'taxonomy'],
            'description' => 'The settings kind in "keep_items" mode, the item kind in "delete_items" mode.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function definitionCreated(): array
    {
        return [
            'type'        => 'object',
            'description' => 'The definition a create call registered.',
            'properties'  => [
                'slug'     => ['type' => 'string', 'required' => true],
                'kind'     => ['type' => 'string', 'required' => true, 'enum' => ['post_types', 'taxonomies']],
                'restored' => [
                    'type'        => 'boolean',
                    'required'    => true,
                    'description' => 'True when settings retained from a previous definition of the same key came back with it.',
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function definitionActive(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Whether the definition is now registered with WordPress.',
            'properties'  => [
                'slug'   => ['type' => 'string', 'required' => true],
                'kind'   => ['type' => 'string', 'required' => true, 'enum' => ['post_types', 'taxonomies']],
                'active' => ['type' => 'boolean', 'required' => true],
            ],
        ];
    }
}
