<?php

namespace Kizlo\WooCommerce\Modules\Variation;

use Kizlo\Modules\Post\ContentChanges;
use Kizlo\Modules\Webhook\Webhook;
use WC_Product;

/** Persisted data-store hooks also cover API, scheduled and programmatic writes. */
class VariationListener
{
    private array $parents = [];
    private array $deletions = [];

    public function register(): void
    {
        foreach (['product', 'product_variation'] as $kind) {
            add_action("woocommerce_before_{$kind}_object_save", [$this, 'capture'], 10, 1);
            add_action("woocommerce_after_{$kind}_object_save", [$this, 'saved'], PHP_INT_MAX, 1);
            add_action("woocommerce_before_delete_{$kind}", [$this, 'beforeDelete']);
            add_action("woocommerce_delete_{$kind}", [$this, 'deleted'], PHP_INT_MAX);
        }
        add_action('woocommerce_trash_product_variation', [$this, 'trashed']);
        add_action('woocommerce_attribute_added', [$this, 'attributeAdded'], PHP_INT_MAX, 2);
        add_action('woocommerce_attribute_updated', [$this, 'attributeUpdated'], PHP_INT_MAX, 3);
        add_action('woocommerce_attribute_deleted', [$this, 'attributeDeleted'], PHP_INT_MAX, 3);
    }

    public function capture(WC_Product $product): void
    {
        $id = $product->get_id();
        $old = $id ? get_post($id) : null;
        $parents = $product->is_type('variation') ? array_filter([$old?->post_parent, $product->get_parent_id()]) : [$id];
        foreach (array_unique($parents) as $parent) {
            ContentChanges::capturePost((int) $parent);
            $this->parents[spl_object_id($product)][] = (int) $parent;
        }
    }

    public function saved(WC_Product $product): void
    {
        $parents = $this->parents[spl_object_id($product)] ?? [];
        $parents[] = $product->is_type('variation') ? $product->get_parent_id() : $product->get_id();
        foreach (array_unique(array_filter($parents)) as $id) {
            $post = get_post($id);
            if ($post) ContentChanges::post($post);
        }
        unset($this->parents[spl_object_id($product)]);
        if (!wp_is_serving_rest_request() && !wp_doing_ajax()) ContentChanges::flush();
    }

    public function beforeDelete(int $id): void
    {
        $post = get_post($id);
        if (!$post || $post->post_type !== 'product_variation') return;
        $this->deletions[$id] = (int) $post->post_parent;
        ContentChanges::capturePost((int) $post->post_parent);
    }

    public function deleted(int $id): void
    {
        $parent = $this->deletions[$id] ?? null;
        unset($this->deletions[$id]);
        if (!$parent || get_post($id)) return;
        $post = get_post($parent);
        if ($post) ContentChanges::post($post);
        if (!wp_is_serving_rest_request() && !wp_doing_ajax()) ContentChanges::flush();
    }

    public function trashed(int $id): void
    {
        $variation = get_post($id);
        if (!$variation || $variation->post_status !== 'trash') return;
        $parent = get_post($variation->post_parent);
        if ($parent) ContentChanges::post($parent);
    }

    public function attributeAdded(int $id, array $data): void
    {
        Webhook::sendEvent(Webhook::SETTINGS_TAXONOMY_UPDATED_EVENT, ['key' => wc_attribute_taxonomy_name($data['attribute_name'])]);
    }

    public function attributeUpdated(int $id, array $data, string $old): void
    {
        foreach (array_unique([$old, $data['attribute_name']]) as $name) Webhook::sendEvent(Webhook::SETTINGS_TAXONOMY_UPDATED_EVENT, ['key' => wc_attribute_taxonomy_name($name)]);
    }

    public function attributeDeleted(int $id, string $name, string $taxonomy): void
    {
        Webhook::sendEvent(Webhook::SETTINGS_TAXONOMY_UPDATED_EVENT, ['key' => $taxonomy]);
    }
}
