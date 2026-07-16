<?php

namespace Kizlo\Modules\PostType;

use Kizlo\Modules\Post\PostSchema;
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
            $this->extendBase($data),
            [
                'seo'    => [
                    'head'   => $post_seo->buildMeta($post),
                    'schema' => $post_seo->jsonLd($post),
                ],
                'extend' => $extend,
            ]
        );

        return $data;
    }

    public function extendListItem(array $data): array
    {
        $extend        = $data['kizlo']['extend'] ?? [];
        $data['kizlo'] = array_merge(
            $this->extendBase($data),
            ['extend' => $extend]
        );

        return $data;
    }

    private function extendBase(array $data): array
    {
        $base = [];
        $id   = $data['id'];

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
            $full          = wp_get_attachment_image_src($thumbnail_id, 'full');
            $base['featured_media'] = [
                'id'  => $thumbnail_id,
                'url' => $full[0] ?? null,
                'alt' => get_post_meta($thumbnail_id, '_wp_attachment_image_alt', true),
            ];
        }

        return $base;
    }
}
