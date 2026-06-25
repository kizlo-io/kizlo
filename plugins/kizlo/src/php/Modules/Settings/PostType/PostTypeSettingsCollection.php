<?php

namespace Kizlo\Modules\Settings\PostType;

/**
 * Collection of PostTypeSettings instances keyed by post type slug.
 *
 * @since 1.0.0
 */
class PostTypeSettingsCollection
{
    /** 
     * @var array<string, PostTypeSettings> 
     */
    private array $items;

    /**
     * @param array<string, PostTypeSettings> $items
     */
    public function __construct(array $items)
    {
        $this->items = $items;
    }

    /**
     * Get settings for a specific post type.
     *
     * @param  string $post_type Post type.
     * @return PostTypeSettings
     */
    public function get(string $post_type): PostTypeSettings
    {
        return $this->items[$post_type] ?? new PostTypeSettings();
    }

    /**
     * Get all post type settings instances.
     *
     * @return array<string, PostTypeSettings>
     */
    public function all(): array
    {
        return $this->items;
    }
}
