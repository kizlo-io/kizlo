<?php

namespace Kizlo\WooCommerce\Modules\Integration;

use WP_Post;
use WC_Meta_Box_Product_Data;
use WC_Meta_Box_Product_Images;

/**
 * Bridges core Kizlo's extension hooks for WooCommerce-specific behavior that
 * used to live hardcoded in core. Responsibilities:
 *
 *   1. Take over preview-save for the 'product' post type (previously hardcoded
 *      in PreviewModule::handleProduct()).
 *   2. Inject WC's post type ('product') and taxonomies ('product_cat',
 *      'product_tag') into core's "internal" defaults so they ship with the
 *      same baseline settings they used to when WC was bundled in core.
 *   3. Add 'product' / 'product_cat' / 'product_tag' to the default
 *      watched post-types and taxonomies lists.
 */
class CoreIntegration
{
    public function register(): void
    {
        add_filter('kizlo_preview_handle', [$this, 'handlePreview'], 10, 3);
        add_filter('kizlo_internal_post_types', [$this, 'addInternalPostTypes']);
        add_filter('kizlo_internal_taxonomies', [$this, 'addInternalTaxonomies']);
        add_filter('kizlo_default_watched_post_types', [$this, 'addWatchedPostTypes']);
        add_filter('kizlo_default_watched_taxonomies', [$this, 'addWatchedTaxonomies']);
    }

    public function addInternalPostTypes(array $defaults): array
    {
        return $defaults + [
            'product' => ['article_type' => 'none', 'seo_enabled' => true],
        ];
    }

    public function addInternalTaxonomies(array $defaults): array
    {
        return $defaults + [
            'product_cat' => ['seo_enabled' => true],
            'product_tag' => ['seo_enabled' => true],
        ];
    }

    public function addWatchedPostTypes(array $defaults): array
    {
        return array_values(array_unique(array_merge($defaults, ['product'])));
    }

    public function addWatchedTaxonomies(array $defaults): array
    {
        return array_values(array_unique(array_merge($defaults, ['product_cat', 'product_tag'])));
    }

    /**
     * Preview-save for products. Mirrors the original
     * PreviewModule::handleProduct() body byte-for-byte; only the dispatch
     * mechanism (filter vs. hardcoded branch) has changed.
     */
    public function handlePreview(mixed $result, WP_Post $post, ?WP_Post $preview_post): mixed
    {
        if ($result !== null) return $result;
        if ($post->post_type !== 'product') return $result;

        unset($_POST['_sku']);
        unset($_POST['_stock']);

        if ($preview_post) {
            $new_post_id = $preview_post->ID;
            wp_update_post($_POST);
        } else {
            $new_post_id = wp_insert_post(wp_slash($_POST), true);

            if (is_wp_error($new_post_id)) {
                wp_send_json_error('Failed to create preview', 500);
            }

            update_post_meta($post->ID, '_kizlo_preview', $new_post_id);
        }

        WC_Meta_Box_Product_Data::save($new_post_id, $post);
        WC_Meta_Box_Product_Images::save($new_post_id, $post);

        return $new_post_id;
    }
}
