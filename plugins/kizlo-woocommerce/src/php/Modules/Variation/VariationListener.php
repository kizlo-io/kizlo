<?php

namespace Kizlo\WooCommerce\Modules\Variation;

use Kizlo\Modules\Webhook\Webhook;

/**
 * Emits a Kizlo "post updated" webhook for WC product variations changing via
 * the admin's ajax endpoints. Listens to the variation-modification actions WC
 * fires from the product editor and resolves the parent product id from the
 * incoming $_POST shape.
 */
class VariationListener
{
    private const ACTIONS = [
        'woocommerce_save_attributes',
        'woocommerce_save_variations',
        'woocommerce_remove_variations',
        'woocommerce_add_variation',
        'woocommerce_bulk_edit_variations',
        'woocommerce_delete_variations',
        'woocommerce_link_all_variations',
    ];

    public function register(): void
    {
        foreach (self::ACTIONS as $action) {
            add_action("wp_ajax_{$action}", [$this, 'onVariationChanged']);
        }
    }

    public function onVariationChanged(): void
    {
        $post_id = 0;

        if (empty($_POST)) return;

        // 1. Direct post_id (most consistent)
        if (!empty($_POST['post_id'])) {
            $post_id = (int) $_POST['post_id'];
        }

        // 2. product_id (used in some actions)
        if (!empty($_POST['product_id'])) {
            $post_id = (int) $_POST['product_id'];
        }

        // 3. variation_ids → resolve parent (remove_variations)
        if (!empty($_POST['variation_ids'])) {
            $variation_id = (int) $_POST['variation_ids'][0];
            $post_id = (int) wp_get_post_parent_id($variation_id);
        }

        // 4. variable_post_id (extra safety for save_variations)
        if (!empty($_POST['variable_post_id'])) {
            $variation_id = (int) $_POST['variable_post_id'][0];
            $post_id = (int) wp_get_post_parent_id($variation_id);
        }

        $post = get_post($post_id);
        if (!$post) return;

        if ($post->post_status !== 'publish') {
            return;
        }

        Webhook::sendEvent(Webhook::POST_UPDATED_EVENT, [
            'post_id'   => $post_id,
            'post_type' => 'product'
        ]);
    }
}
