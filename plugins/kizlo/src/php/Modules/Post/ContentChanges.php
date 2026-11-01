<?php

namespace Kizlo\Modules\Post;

use Kizlo\Modules\Webhook\Webhook;
use Kizlo\Modules\Webhook\WebhookModule;
use Kizlo\Support\Utils;
use WP_Post;
use WP_Term;

/** Request-local evidence collected before removal and emitted only by successful after-hooks. */
final class ContentChanges
{
    private static array $posts = [];
    private static array $terms = [];
    private static array $pending = [];
    private static array $public = [];

    public static function capturePost(int $id): void
    {
        $post = get_post($id);
        if (!$post instanceof WP_Post || !self::watchedPost($post)) return;
        $data = self::postData($post);
        self::$public[$id] = (self::$public[$id] ?? false) || $post->post_status === 'publish';
        if (isset(self::$posts[$id])) {
            $data['affected_terms'] = ContentDependencies::merge(self::$posts[$id]['affected_terms'], $data['affected_terms']);
            if (self::$posts[$id]['url']) $data['url'] = self::$posts[$id]['url'];
        }
        self::$posts[$id] = $data;
    }

    public static function post(WP_Post $post, string $type = Webhook::POST_UPDATED_EVENT): void
    {
        if (!self::watchedPost($post)) return;
        $previous = self::$posts[$post->ID] ?? null;
        if ($post->post_status !== 'publish' && !(self::$public[$post->ID] ?? false) && !in_array($type, [Webhook::POST_DELETED_EVENT, Webhook::POST_TRASHED_EVENT], true)) return;
        $data = self::postData($post);
        if ($previous) {
            $data['affected_terms'] = ContentDependencies::merge($previous['affected_terms'], $data['affected_terms']);
            if ($post->post_status !== 'publish') $data['url'] = $previous['url'];
        }
        self::queue($type, 'post:' . $post->ID, $data);
    }

    public static function addPostDependencies(int $id, ?array $dependencies): void
    {
        self::capturePost($id);
        if (isset(self::$posts[$id])) self::$posts[$id]['affected_terms'] = ContentDependencies::merge(self::$posts[$id]['affected_terms'], $dependencies);
    }

    public static function deletedPost(WP_Post $post): void
    {
        if (!self::watchedPost($post)) return;
        $data = self::$posts[$post->ID] ?? self::postData($post);
        self::queue(Webhook::POST_DELETED_EVENT, 'post:' . $post->ID, $data);
    }

    public static function captureTerm(int $id, string $taxonomy): void
    {
        if (!self::watchedTerm($taxonomy)) return;
        $term = get_term($id, $taxonomy);
        if (!$term instanceof WP_Term) return;
        $data = self::termData($term);
        if (isset(self::$terms[$id])) $data['affected_terms'] = ContentDependencies::merge(self::$terms[$id]['affected_terms'], $data['affected_terms']);
        self::$terms[$id] = $data;
    }

    public static function term(WP_Term $term, string $type): void
    {
        if (!self::watchedTerm($term->taxonomy)) return;
        $data = $type === Webhook::TERM_DELETED_EVENT && isset(self::$terms[$term->term_id]) ? self::$terms[$term->term_id] : self::termData($term);
        if (isset(self::$terms[$term->term_id])) {
            $data['affected_terms'] = ContentDependencies::merge(self::$terms[$term->term_id]['affected_terms'], $data['affected_terms']);
            if ($type === Webhook::TERM_DELETED_EVENT) $data['url'] = self::$terms[$term->term_id]['url'];
        }
        self::queue($type, 'term:' . $term->term_id, $data);
    }

    private static function queue(string $type, string $identity, array $data): void
    {
        foreach (self::$pending as &$entry) {
            if ($entry['identity'] !== $identity) continue;
            $data['affected_terms'] = ContentDependencies::merge($entry['data']['affected_terms'], $data['affected_terms']);
            $entry['data']['affected_terms'] = $data['affected_terms'];
        }
        unset($entry);
        if ($type === Webhook::POST_UPDATED_EVENT && isset(self::$pending[$identity . ':' . Webhook::POST_CREATED_EVENT])) $type = Webhook::POST_CREATED_EVENT;
        $key = $identity . ':' . $type;
        self::$pending[$key] = ['identity' => $identity, 'type' => $type, 'data' => $data];
    }

    public static function flush(): void
    {
        if (!post_type_exists(WebhookModule::TYPE)) return;
        if (self::$pending && (!WebhookModule::targets() || !Utils::getSettings()->site->getSecret())) {
            self::$pending = [];
        }
        foreach (self::$pending as $key => $entry) {
            $data = $entry['data'];
            if (str_starts_with($entry['identity'], 'post:') && $entry['type'] !== Webhook::POST_DELETED_EVENT) {
                $post = get_post($data['post_id']);
                if ($post instanceof WP_Post) $data['affected_terms'] = ContentDependencies::merge($data['affected_terms'], ContentDependencies::affected($post->ID));
            }
            $data['affected_terms'] = $data['affected_terms'] === null ? null : (object) $data['affected_terms'];
            // Failed insertion remains visible and gets one late-request catch-up attempt.
            if (Webhook::sendEvent($entry['type'], $data)) unset(self::$pending[$key]);
        }
        if (!self::$pending) { self::$posts = []; self::$terms = []; self::$public = []; }
    }

    public static function watchedPost(WP_Post $post): bool
    {
        return $post->post_type !== WebhookModule::TYPE && !wp_is_post_revision($post->ID) && !wp_is_post_autosave($post->ID)
            && in_array($post->post_type, Utils::getSettings()->webhook->getPostTypes(), true)
            && Utils::getSettings()->postTypes->get($post->post_type)->getAccessEnabled();
    }

    public static function watchedTerm(string $taxonomy): bool
    {
        return ContentDependencies::exposed($taxonomy) && in_array($taxonomy, Utils::getSettings()->webhook->getTaxonomies(), true);
    }

    private static function postData(WP_Post $post): array
    {
        $settings = Utils::getSettings();
        return ['post_id' => $post->ID, 'post_type' => $post->post_type,
            'url' => $settings->resolvePostUrl($post, $settings->postTypes->get($post->post_type)),
            'affected_terms' => ContentDependencies::affected($post->ID)];
    }

    private static function termData(WP_Term $term): array
    {
        $settings = Utils::getSettings();
        return ['term_id' => $term->term_id, 'taxonomy' => $term->taxonomy,
            'post_types' => get_taxonomy($term->taxonomy)->object_type, 'count' => $term->count,
            'url' => $settings->resolveTermUrl($term, $settings->taxonomies->get($term->taxonomy)),
            'affected_terms' => ContentDependencies::termChange($term)];
    }
}
