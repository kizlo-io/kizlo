<?php

namespace Kizlo\Modules\Settings\PostType;

use WP_Post_Type;
use Kizlo\Modules\Settings\SettingsIndexedAbstract;
use Kizlo\Modules\Settings\HasBreadcrumbsSetting;

class PostTypeSettings extends SettingsIndexedAbstract
{
    use HasBreadcrumbsSetting;

    protected const OPTION_KEY = 'kizlo_settings_post_types';

    protected array $data = [
        'pathname_structure'       => null,
        'title_structure'          => null,
        'description_structure'    => null,
        'search_engine_visibility' => true,
        'webpage_type'             => 'WebPage',
        'article_type'             => null,
        'comment_action_structure' => null,
        'seo_enabled'              => null,
        'rest_api_enabled'         => true,
        'breadcrumbs'              => [],
    ];

    protected const INTERNAL_POST_TYPES = [
        'post'       => ['article_type' => 'Article', 'seo_enabled' => true],
        'page'       => ['article_type' => 'none', 'seo_enabled' => true],
        'attachment' => ['article_type' => 'none', 'seo_enabled' => false],
    ];

    private static function internalPostTypes(): array
    {
        static $cache = null;
        if ($cache === null) {
            $cache = apply_filters('kizlo_internal_post_types', self::INTERNAL_POST_TYPES);
        }
        return $cache;
    }

    protected const KNOWN_SUPPORTS = [
        'title',
        'editor',
        'author',
        'thumbnail',
        'excerpt',
        'trackbacks',
        'custom-fields',
        'comments',
        'revisions',
        'page-attributes',
        'post-formats',
    ];

    public static function load(string $id): static
    {
        $instance = parent::load($id);

        foreach (self::internalPostTypes()[$id] ?? [] as $key => $default_value) {
            if (array_key_exists($key, $instance->data) && $instance->data[$key] === null) {
                $instance->data[$key] = $default_value;
            }
        }

        return $instance;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'seo_enabled',
            'rest_api_enabled',
            'search_engine_visibility' => (bool) $value,

            'article_type',
            'webpage_type',
            'title_structure',
            'pathname_structure',
            'description_structure',
            'comment_action_structure' => !empty($value) ? sanitize_text_field($value) : null,

            'breadcrumbs'              => $this->sanitizeBreadcrumbs($value),

            default => $value,
        };
    }

    /**
     * The URL pathname structure for this post type, supporting variable placeholders (e.g. /posts/{{slug}}).
     */
    public function getPathnameStructure(): ?string
    {
        return $this->get('pathname_structure');
    }

    /** @param string|null $value Pathname structure or null to clear. */
    public function setPathnameStructure(?string $value): static
    {
        $this->set('pathname_structure', $value);
        return $this;
    }

    /**
     * The SEO title structure for this post type, supporting variable placeholders.
     */
    public function getTitleStructure(): ?string
    {
        return $this->get('title_structure');
    }

    /** @param string|null $value Title structure or null to clear. */
    public function setTitleStructure(?string $value): static
    {
        $this->set('title_structure', $value);
        return $this;
    }

    /**
     * The SEO description structure for this post type, supporting variable placeholders.
     */
    public function getDescriptionStructure(): ?string
    {
        return $this->get('description_structure');
    }

    /** @param string|null $value Description structure or null to clear. */
    public function setDescriptionStructure(?string $value): static
    {
        $this->set('description_structure', $value);
        return $this;
    }

    /**
     * Whether this post type is visible to search engines. Defaults to true.
     */
    public function getSearchEngineVisibility(): bool
    {
        return (bool) $this->get('search_engine_visibility');
    }

    /** @param bool $value True to allow indexing, false to block. */
    public function setSearchEngineVisibility(bool $value): static
    {
        $this->set('search_engine_visibility', $value);
        return $this;
    }

    /**
     * The Schema.org WebPage type for this post type (e.g. WebPage, AboutPage). Defaults to 'WebPage'.
     */
    public function getWebpageType(): string
    {
        return $this->get('webpage_type') ?? 'WebPage';
    }

    /** @param string|null $value Schema.org WebPage type or null to reset to default. */
    public function setWebpageType(?string $value): static
    {
        $this->set('webpage_type', $value);
        return $this;
    }

    /**
     * The Schema.org Article type for this post type (e.g. Article, NewsArticle, BlogPosting).
     */
    public function getArticleType(): ?string
    {
        return $this->get('article_type');
    }

    /** @param string|null $value Schema.org Article type or null to clear. */
    public function setArticleType(?string $value): static
    {
        $this->set('article_type', $value);
        return $this;
    }

    /**
     * The URL structure for the comment action, supporting variable placeholders.
     */
    public function getCommentActionStructure(): ?string
    {
        return $this->get('comment_action_structure');
    }

    /** @param string|null $value Structure template or null to clear. */
    public function setCommentActionStructure(?string $value): static
    {
        $this->set('comment_action_structure', $value);
        return $this;
    }

    /**
     * Whether this post type is accessible via the Kizlo API.
     */
    public function getAccessEnabled(): bool
    {
        return (bool) $this->get('rest_api_enabled');
    }

    /** @param bool $value True to enable, false to disable. */
    public function setAccessEnabled(bool $value): static
    {
        $this->set('rest_api_enabled', $value);
        return $this;
    }

    /**
     * Whether SEO settings are enabled for this post type.
     */
    public function getSeoEnabled(): bool
    {
        return (bool) $this->get('seo_enabled');
    }

    /** @param bool $value True to enable, false to disable. */
    public function setSeoEnabled(bool $value): static
    {
        $this->set('seo_enabled', $value);
        return $this;
    }

    /**
     * Checks if post type is internal or not.
     * 
     * @param string $post_type
     * @return bool
     */
    public static function checkInternal(string $post_type): bool
    {
        return array_key_exists($post_type, self::internalPostTypes());
    }

    /**
     * Returns support status for all known post type features.
     *
     * @param string $name Post type key.
     * @return array<string, bool> Feature name mapped to support status.
     */
    public static function getSupports(string $name): array
    {
        $registered = get_all_post_type_supports($name);

        $supports = [];
        foreach (self::KNOWN_SUPPORTS as $feature) {
            $supports[$feature] = isset($registered[$feature]) && !empty($registered[$feature]);
        }

        return $supports;
    }

    /**
     * Returns all registered post statuses with their access flags.
     *
     * @return list<array{
     *     label: string,
     *     slug: string,
     *     public: bool,
     *     private: bool,
     *     internal: bool,
     *     protected: bool,
     * }>
     */
    public static function getStatuses(): array
    {
        $statuses = get_post_stati([], 'objects');
        $result   = [];

        foreach ($statuses as $slug => $status) {
            $result[] = [
                'label'  => $status->label,
                'slug'   => $slug,
                'public' => (bool) $status->public,
                'private'   => (bool) $status->private,
                'internal'  => (bool) $status->internal,
                'protected' => (bool) $status->protected,
            ];
        }

        return $result;
    }

    /**
     * Returns all post types available in Kizlo.
     *
     * Merges WordPress registered post types (show_in_rest: true) with
     * explicitly included ones via kizlo_include_post_type(). Items in
     * the exclusion list can be overridden per item by explicitly including them.
     *
     * @return WP_Post_Type[]
     */
    public static function getAvailableObjects(): array
    {
        $defaults      = array_keys(self::internalPostTypes());
        $included      = apply_filters('kizlo_included_post_types', []);
        $allowed       = array_unique(array_merge($defaults, $included));
        $wp_post_types = get_post_types([], 'objects');

        $available = [];

        foreach ($wp_post_types as $post_type => $object) {
            if (!$object->show_in_rest || !in_array($post_type, $allowed, true)) {
                continue;
            }
            $available[$post_type] = $object;
        }

        foreach ($included as $post_type) {
            if (!isset($available[$post_type]) && post_type_exists($post_type)) {
                $pt = get_post_type_object($post_type);
                if ($pt->show_in_rest) {
                    $available[$post_type] = $pt;
                }
            }
        }

        return $available;
    }
}
