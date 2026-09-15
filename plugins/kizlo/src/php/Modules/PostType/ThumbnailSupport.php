<?php

namespace Kizlo\Modules\PostType;

use Kizlo\Modules\Settings\PostType\PostTypeSettings;

/**
 * Declares `post-thumbnails` theme support for the post types Kizlo manages.
 *
 * `register_post_type(['supports' => ['thumbnail']])` alone is not enough: both
 * editors additionally gate the Featured image panel on the active theme
 * declaring `post-thumbnails`. A headless theme has no reason to declare it, and
 * WordPress auto-adds it for block themes only, so a user enabling "Featured
 * image" in the settings UI would otherwise see nothing change.
 *
 * The declaration belongs to the plugin rather than the bundled theme because
 * users run their own themes and the plugin is what knows which post types Kizlo
 * manages. Passing the keys as an array is the scoped form: core keeps an
 * existing `true` and merges an existing array, so this never widens a theme's
 * own choice.
 */
class ThumbnailSupport
{
    public function register(): void
    {
        // Priority 30: after Registrar::registerObjects() at 20, so Kizlo-owned
        // types are registered and their supports can be read back.
        add_action('init', [$this, 'declareSupport'], 30);
    }

    public function declareSupport(): void
    {
        $keys = [];

        foreach (array_keys(PostTypeSettings::getAvailableObjects()) as $post_type) {
            if (post_type_supports($post_type, 'thumbnail')) {
                $keys[] = $post_type;
            }
        }

        if ($keys === []) {
            return;
        }

        add_theme_support('post-thumbnails', $keys);
    }
}
