<?php

namespace Kizlo\Modules\Taxonomy;

use Kizlo\Modules\Webhook\Webhook;
use Kizlo\Support\Utils;
use WP_Term;

class TermListener
{
    public function register(): void
    {
        add_action('saved_term', [$this, 'onSaved'], PHP_INT_MAX, 4);
        add_action('delete_term', [$this, 'onDeleted'], PHP_INT_MAX, 5);
    }

    public function onSaved(int $term_id, int $tt_id, string $taxonomy, bool $update)
    {
        $tax = get_taxonomy($taxonomy);
        if (!$tax) return;
        if (! $this->_isWatched($taxonomy)) return;

        $count = $update ? get_term($term_id)->count : 0;

        $event_type = ($update ? Webhook::TERM_UPDATED_EVENT : Webhook::TERM_CREATED_EVENT);

        Webhook::sendEvent($event_type, [
            'term_id'   => $term_id,
            'taxonomy' => $taxonomy,
            'post_types' => $tax->object_type,
            'count'     => $count
        ]);
    }

    public function onDeleted(int $term_id, int $tt_id, string $taxonomy, WP_Term $deleted_term, array $object_ids)
    {
        $tax = get_taxonomy($taxonomy);
        if (!$tax) return;
        if (! $this->_isWatched($taxonomy)) return;

        Webhook::sendEvent(Webhook::TERM_DELETED_EVENT, [
            'term_id'   => $term_id,
            'taxonomy' => $taxonomy,
            'post_types' => $tax->object_type,
            'count'     => $deleted_term->count
        ]);
    }

    private function _isWatched(string $taxonomy): bool
    {
        return in_array($taxonomy, Utils::getSettings()->webhook->getTaxonomies(), true);
    }
}
