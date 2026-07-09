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

        $term = get_term($term_id, $taxonomy);
        if (! $term instanceof WP_Term) return;

        $count = $update ? $term->count : 0;

        $event_type = ($update ? Webhook::TERM_UPDATED_EVENT : Webhook::TERM_CREATED_EVENT);

        Webhook::sendEvent($event_type, $this->_eventPayload($term, $tax->object_type, $count));
    }

    public function onDeleted(int $term_id, int $tt_id, string $taxonomy, WP_Term $deleted_term, array $object_ids)
    {
        $tax = get_taxonomy($taxonomy);
        if (!$tax) return;
        if (! $this->_isWatched($taxonomy)) return;

        Webhook::sendEvent(Webhook::TERM_DELETED_EVENT, $this->_eventPayload($deleted_term, $tax->object_type, $deleted_term->count));
    }

    private function _eventPayload(WP_Term $term, array $post_types, int $count): array
    {
        $settings = Utils::getSettings();

        return [
            'term_id'   => $term->term_id,
            'taxonomy' => $term->taxonomy,
            'post_types' => $post_types,
            'count'     => $count,
            'url'       => $settings->resolveTermUrl($term, $settings->taxonomies->get($term->taxonomy)),
        ];
    }

    private function _isWatched(string $taxonomy): bool
    {
        return in_array($taxonomy, Utils::getSettings()->webhook->getTaxonomies(), true);
    }
}
