<?php

namespace Kizlo\Modules\Post;

use WP_Post;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Utils;
use Kizlo\Modules\CustomFields\CustomFieldsStore;

class PostExtension
{
    public function register(): void
    {
        add_filter('rest_prepare_post', [$this, 'prepare'], PHP_INT_MAX, 3);
    }

    public function prepare(WP_REST_Response $response, WP_Post $post, WP_REST_Request $request): WP_REST_Response
    {
        $data = $request->get_param('id')
            ? $this->extendSingle($response->get_data(), $post)
            : $this->extendListItem($response->get_data(), $post);

        $definitions = Utils::getSettings()->postTypes->get($post->post_type)->getCustomFields();
        $data        = CustomFieldsStore::inject($data, CustomFieldsStore::META_POST, $post->ID, $definitions);

        $response->set_data($data);

        return $response;
    }

    public function extendSingle(array $data, WP_Post $post): array
    {
        $base = $this->_extendPostBase($post);

        $settings = Utils::getSettings();
        $post_seo = new PostSchema($settings);

        $data['kizlo'] = array_merge([
            'seo'            => [
                'head'  => $post_seo->buildMeta($post),
                'schema' => $post_seo->jsonLd($post),
            ]
        ], $base, kizlo_apply_extend_filter('post', $post));

        return $data;
    }

    public function extendListItem(array $data, WP_Post $post): array
    {
        $base = $this->_extendPostBase($post);

        $data['kizlo'] = array_merge([], $base,  kizlo_apply_extend_filter('post_list_item', $post));

        return $data;
    }

    private function _extendPostBase(WP_Post $post)
    {
        $categories = [];
        foreach (wp_get_post_categories($post->ID, ['fields' => 'all']) as $term) {
            $categories[] = [
                'id'   => $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
            ];
        }

        $tags = [];
        foreach (wp_get_post_tags($post->ID, ['fields' => 'all']) as $term) {
            $tags[] = [
                'id'   => $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
            ];
        }

        $author_id = (int) $post->post_author;
        $author    = [
            'id'           => $author_id,
            'name'         => get_the_author_meta('display_name', $author_id),
            'slug'         => get_the_author_meta('user_nicename', $author_id),
            'avatar_url'   => get_avatar_url($author_id),
        ];

        $featured_image = null;
        $thumbnail_id   = get_post_thumbnail_id($post->ID);
        if ($thumbnail_id) {
            $featured_image = kizlo_ensure_media_image_data($thumbnail_id);
        }

        return [
            'tags'           => $tags,
            'author'         => $author,
            'categories'     => $categories,
            'featured_image' => $featured_image,
        ];
    }
}
