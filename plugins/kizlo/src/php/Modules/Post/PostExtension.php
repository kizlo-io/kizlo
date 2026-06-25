<?php

namespace Kizlo\Modules\Post;

use WP_Post;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Utils;

class PostExtension
{
    public function register(): void
    {
        add_filter('rest_prepare_post', [$this, 'prepare'], PHP_INT_MAX, 3);
    }

    public function prepare(WP_REST_Response $response, WP_Post $post, WP_REST_Request $request): WP_REST_Response
    {
        if ($request->get_param('id')) {
            $response->set_data($this->extendSingle($response->get_data(), $post));
        } else {
            $response->set_data($this->extendListItem($response->get_data(), $post));
        }

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
        // Categories
        $categories = [];
        foreach (wp_get_post_categories($post->ID, ['fields' => 'all']) as $term) {
            $categories[] = [
                'id'   => $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
            ];
        }

        // Tags
        $tags = [];
        foreach (wp_get_post_tags($post->ID, ['fields' => 'all']) as $term) {
            $tags[] = [
                'id'   => $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
            ];
        }

        // Author
        $author_id = (int) $post->post_author;
        $author    = [
            'id'           => $author_id,
            'name'         => get_the_author_meta('display_name', $author_id),
            'slug'         => get_the_author_meta('user_nicename', $author_id),
            'avatar_url'   => get_avatar_url($author_id),
        ];

        // Featured image
        $featured_image = null;
        $thumbnail_id   = get_post_thumbnail_id($post->ID);
        if ($thumbnail_id) {
            $full  = wp_get_attachment_image_src($thumbnail_id, 'full');

            $featured_image = [
                'id'     => $thumbnail_id,
                'url'    => $full[0] ?? null,
                'alt'    => get_post_meta($thumbnail_id, '_wp_attachment_image_alt', true),
            ];
        }

        return [
            'tags'           => $tags,
            'author'         => $author,
            'categories'     => $categories,
            'featured_image' => $featured_image,
        ];
    }
}
