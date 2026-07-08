<?php

namespace Kizlo\Modules\Post;

use WP_Post;
use Kizlo\Support\Utils;
use Kizlo\Modules\Webhook\Webhook;

class PostListener
{
    public function register(): void
    {
        add_action('transition_post_status', [$this, 'onTransition'], PHP_INT_MAX, 3);
        add_action('trashed_post', [$this, 'onTrashed']);
        add_action('deleted_post', [$this, 'onDeleted'], PHP_INT_MAX, 2);
    }

    public function onTransition(string $new, string $old, WP_Post $post): void
    {
        if (! $this->_isWatched($post->post_type)) return;

        if ($new === 'publish') {
            $event = $old === 'publish' ? Webhook::POST_UPDATED_EVENT : Webhook::POST_CREATED_EVENT;
            Webhook::sendEvent($event, $this->_eventPayload($post));
        }
    }

    public function onTrashed(int $post_id): void
    {
        $post_type = get_post_type($post_id);
        if (! $this->_isWatched($post_type)) return;

        $post = get_post($post_id);

        if ($post instanceof WP_Post) {
            Webhook::sendEvent(Webhook::POST_TRASHED_EVENT, $this->_eventPayload($post));
        }
    }

    public function onDeleted(int $post_id, WP_Post $post): void
    {
        if (! $this->_isWatched($post->post_type)) return;

        Webhook::sendEvent(Webhook::POST_DELETED_EVENT, $this->_eventPayload($post));
    }

    private function _eventPayload(WP_Post $post): array
    {
        $settings = Utils::getSettings();

        return [
            'post_id'   => $post->ID,
            'post_type' => $post->post_type,
            'url'       => $settings->resolvePostUrl($post, $settings->postTypes->get($post->post_type)),
        ];
    }

    private function _isWatched(string $post_type): bool
    {
        return in_array($post_type, Utils::getSettings()->webhook->getPostTypes(), true);
    }
}
