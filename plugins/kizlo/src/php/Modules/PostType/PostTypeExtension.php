<?php

namespace Kizlo\Modules\PostType;

use Kizlo\Modules\Post\PostSchema;
use Kizlo\Modules\Settings\Settings;
use Kizlo\Modules\CustomFields\CustomFieldsStore;
use Kizlo\Support\Utils;

class PostTypeExtension
{
    public function extendSingle(array $data): array
    {
        $extend        = $data['kizlo']['extend'] ?? [];
        $post          = get_post($data['id']);
        $settings      = Utils::getSettings();
        $post_seo      = new PostSchema($settings);

        $data['kizlo'] = array_merge(
            $this->extendBase($data, $settings),
            [
                'seo'    => [
                    'head'   => $post_seo->buildMeta($post),
                    'schema' => $post_seo->jsonLd($post),
                ],
                'extend' => $extend,
            ]
        );

        return $this->groupCustomFields($data);
    }

    public function extendListItem(array $data): array
    {
        $extend        = $data['kizlo']['extend'] ?? [];
        $data['kizlo'] = array_merge(
            $this->extendBase($data, Utils::getSettings()),
            ['extend' => $extend]
        );

        return $this->groupCustomFields($data);
    }

    /**
     * Group the post's resolved custom fields inside Kizlo's response envelope.
     * Casting to an object keeps the no-definition JSON shape as `{}` rather than
     * `[]`, matching the declared contract.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function groupCustomFields(array $data): array
    {
        $post = get_post($data['id']);
        if (!$post) {
            $data['kizlo']['custom'] = (object) [];
            return $data;
        }

        $definitions = Utils::getSettings()->postTypes->get($post->post_type)->getCustomFields();
        $custom      = CustomFieldsStore::read(CustomFieldsStore::META_POST, $post->ID, $definitions);

        $data['kizlo']['custom'] = (object) $custom;

        return $data;
    }

    private function extendBase(array $data, Settings $settings): array
    {
        $base = [];
        $id   = $data['id'];
        $post = get_post($id);

        if ($post) {
            $base['url'] = $settings->resolvePostUrl($post, $settings->postTypes->get($post->post_type));
        }

        $categories = wp_get_post_categories($id, ['fields' => 'all']);
        if (!empty($categories)) {
            $base['categories'] = array_map(fn($term) => [
                'id'   => $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
            ], $categories);
        }

        $tags = wp_get_post_tags($id, ['fields' => 'all']);
        if (!empty($tags)) {
            $base['tags'] = array_map(fn($term) => [
                'id'   => $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
            ], $tags);
        }

        $author_id = (int) $data['author'];
        if ($author_id) {
            $base['author'] = [
                'id'         => $author_id,
                'name'       => get_the_author_meta('display_name', $author_id),
                'slug'       => get_the_author_meta('user_nicename', $author_id),
                'avatar_url' => get_avatar_url($author_id),
            ];
        }

        $thumbnail_id = get_post_thumbnail_id($id);
        if ($thumbnail_id) {
            $base['featured_media'] = kizlo_ensure_media_image_data($thumbnail_id);
        }

        return $base;
    }
}
