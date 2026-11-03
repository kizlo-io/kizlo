<?php

namespace Kizlo\Modules\Taxonomy;

use Kizlo\Modules\Post\ContentChanges;
use Kizlo\Modules\Post\PostListener;
use Kizlo\Modules\Webhook\Webhook;
use WP_Term;

class TermListener
{
    private array $reparented = [];

    public function register(): void
    {
        add_action('edit_terms', [ContentChanges::class, 'captureTerm'], 10, 2);
        add_action('pre_delete_term', [ContentChanges::class, 'captureTerm'], 10, 2);
        // Core reparents children in SQL without firing saved_term for them.
        add_action('edit_term_taxonomies', [$this, 'captureChildren']);
        add_action('edited_term_taxonomies', [$this, 'onChildrenReparented'], PHP_INT_MAX);
        add_action('saved_term', [$this, 'onSaved'], PHP_INT_MAX, 4);
        add_action('delete_term', [$this, 'onDeleted'], PHP_INT_MAX, 5);
        foreach (['added_term_meta', 'updated_term_meta', 'deleted_term_meta'] as $hook) add_action($hook, [$this, 'onMeta'], PHP_INT_MAX, 4);
    }

    public function captureChildren(array $tt_ids): void
    {
        foreach ($tt_ids as $tt_id) {
            $term = get_term_by('term_taxonomy_id', $tt_id);
            if (!$term instanceof WP_Term || !ContentChanges::watchedTerm($term->taxonomy)) continue;
            $this->reparented[$tt_id] = $term->parent;
            ContentChanges::captureTerm($term->term_id, $term->taxonomy);
        }
    }

    public function onChildrenReparented(array $tt_ids): void
    {
        foreach ($tt_ids as $tt_id) {
            if (!isset($this->reparented[$tt_id])) continue;
            $parent = $this->reparented[$tt_id];
            unset($this->reparented[$tt_id]);
            $term = get_term_by('term_taxonomy_id', $tt_id);
            if ($term instanceof WP_Term && $term->parent !== $parent) ContentChanges::term($term, Webhook::TERM_UPDATED_EVENT);
        }
    }

    public function onSaved(int $id, int $tt_id, string $taxonomy, bool $update): void
    {
        $term = get_term($id, $taxonomy);
        if ($term instanceof WP_Term) ContentChanges::term($term, $update ? Webhook::TERM_UPDATED_EVENT : Webhook::TERM_CREATED_EVENT);
    }

    public function onDeleted(int $id, int $tt_id, string $taxonomy, WP_Term $term, array $objects): void
    {
        ContentChanges::term($term, Webhook::TERM_DELETED_EVENT);
    }

    public function onMeta(mixed $meta_id, int $id, string $key, mixed $value): void
    {
        $term = get_term($id);
        if ($term instanceof WP_Term && PostListener::exposedMeta('term', $term->taxonomy, $key)) ContentChanges::term($term, Webhook::TERM_UPDATED_EVENT);
    }
}
