<?php

namespace Kizlo\Modules\Post;

use Kizlo\Modules\Webhook\Webhook;
use WP_Post;

class PostListener
{
    public function register(): void
    {
        add_action('pre_post_update', [ContentChanges::class, 'capturePost']);
        add_action('before_delete_post', [ContentChanges::class, 'capturePost']);
        add_action('transition_post_status', [$this, 'onTransition'], PHP_INT_MAX, 3);
        add_action('wp_after_insert_post', [$this, 'onSaved'], PHP_INT_MAX, 2);
        add_action('trashed_post', [$this, 'onTrashed']);
        add_action('deleted_post', [$this, 'onDeleted'], PHP_INT_MAX, 2);
        add_action('delete_term_relationships', [ContentChanges::class, 'capturePost']);
        add_action('deleted_term_relationships', [$this, 'onRelationships']);
        add_action('set_object_terms', [$this, 'onAssigned'], PHP_INT_MAX, 6);
        foreach (['added_post_meta', 'updated_post_meta', 'deleted_post_meta'] as $hook) add_action($hook, [$this, 'onMeta'], PHP_INT_MAX, 4);
    }

    public function onTransition(string $new, string $old, WP_Post $post): void
    {
        if ($new === 'publish' || $old === 'publish') {
            ContentChanges::post($post, $new === 'publish' && $old !== 'publish' ? Webhook::POST_CREATED_EVENT : Webhook::POST_UPDATED_EVENT);
        }
    }

    public function onSaved(int $id, WP_Post $post): void
    {
        if ($post->post_type === \Kizlo\Modules\Webhook\WebhookModule::TYPE) return;
        ContentChanges::post($post);
        // REST enrichment and WC data stores finish later than core insertion.
        if (!wp_is_serving_rest_request() && !wp_doing_ajax() && $post->post_type !== 'product' && $post->post_type !== 'product_variation') ContentChanges::flush();
    }

    public function onTrashed(int $id): void
    {
        $post = get_post($id);
        if ($post instanceof WP_Post) ContentChanges::post($post, Webhook::POST_TRASHED_EVENT);
    }

    public function onDeleted(int $id, WP_Post $post): void
    {
        ContentChanges::deletedPost($post);
    }

    public function onRelationships(int $id): void
    {
        $post = get_post($id);
        if ($post instanceof WP_Post) ContentChanges::post($post);
    }

    public function onAssigned(int $id, mixed $terms, array $tt_ids, string $taxonomy, bool $append, array $old_tt_ids): void
    {
        // Old values are term-taxonomy identities, not term identities. Resolve surviving rows explicitly.
        ContentChanges::capturePost($id);
        $post = get_post($id);
        if (!$post instanceof WP_Post) return;
        foreach ($old_tt_ids as $tt_id) {
            $term = get_term_by('term_taxonomy_id', $tt_id, $taxonomy);
            if ($term && ContentDependencies::exposed($taxonomy)) ContentChanges::addPostDependencies($id, ContentDependencies::term($term));
        }
        ContentChanges::post($post);
    }

    public function onMeta(mixed $meta_id, int $id, string $key, mixed $value): void
    {
        $post = get_post($id);
        if (!$post instanceof WP_Post || !self::exposedMeta('post', $post->post_type, $key)) return;
        ContentChanges::post($post);
    }

    public static function exposedMeta(string $kind, string $subtype, string $key): bool
    {
        $registered = get_registered_meta_keys($kind, $subtype) + get_registered_meta_keys($kind);
        if (!empty($registered[$key]['show_in_rest'])) return true;
        if (str_starts_with($key, '_kizlo_seo_') || ($kind === 'post' && $key === '_thumbnail_id')) return true;
        if ($kind === 'term' && in_array($key, ['thumbnail_id', 'kizlo_term_color', 'kizlo_term_image'], true)) return true;
        $settings = $kind === 'post' ? \Kizlo\Support\Utils::getSettings()->postTypes->get($subtype) : \Kizlo\Support\Utils::getSettings()->taxonomies->get($subtype);
        foreach ($settings->getCustomFields() as $definition) {
            $prefix = 'kcf_' . $definition['name'];
            if ($key === $prefix || str_starts_with($key, $prefix . '_')) return true;
        }
        return (bool) apply_filters('kizlo_dependency_meta_exposed', false, $kind, $subtype, $key);
    }
}
