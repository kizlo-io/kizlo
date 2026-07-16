<?php

namespace Kizlo\Modules\Comment;

use WP_Comment;
use WP_REST_Request;
use WP_REST_Response;

class CommentModule
{
    public function register(): void
    {
        add_filter('rest_prepare_comment', [$this, 'prepare'], PHP_INT_MAX, 3);
        (new CommentSubmission())->register();
    }

    public function prepare(WP_REST_Response $response, WP_Comment $comment, WP_REST_Request $request): WP_REST_Response
    {
        if ($request->get_param('id')) {
            $response->set_data($this->extendSingle($response->get_data(), $comment));
        } else {
            $response->set_data($this->extendListItem($response->get_data(), $comment));
        }

        return $response;
    }

    public function extendSingle(array $data, WP_Comment $comment): array
    {
        $base = $this->_extendBase($comment);
        $data['kizlo'] = array_merge($base, kizlo_apply_extend_filter('comment', $comment));
        return $data;
    }

    public function extendListItem(array $data, WP_Comment $comment): array
    {
        $base = $this->_extendBase($comment);
        $data['kizlo'] = array_merge($base, kizlo_apply_extend_filter('comment_list_item', $comment));
        return $data;
    }

    private function _extendBase(WP_Comment $comment): array
    {
        $author = null;
        if ((int) $comment->user_id) {
            $user = get_user_by('id', $comment->user_id);
            if ($user) {
                $author = [
                    'id'         => $user->ID,
                    'name'       => $user->display_name,
                    'slug'       => $user->user_nicename,
                    'avatar_url' => get_avatar_url($user->ID),
                ];
            }
        }

        $post = null;
        $post_obj = get_post((int) $comment->comment_post_ID);
        if ($post_obj) {

            $featured_image = null;
            $thumbnail_id   = get_post_thumbnail_id($post_obj->ID);
            if ($thumbnail_id) {
                $full  = wp_get_attachment_image_src($thumbnail_id, 'full');

                $featured_image = [
                    'id'     => $thumbnail_id,
                    'url'    => $full[0] ?? null,
                    'alt'    => get_post_meta($thumbnail_id, '_wp_attachment_image_alt', true),
                ];
            }

            $post = [
                'id'    => $post_obj->ID,
                'slug'  => $post_obj->post_name,
                'title' => get_the_title($post_obj),
                'featured_image'  => $featured_image,
            ];
        }

        $reply_count = (int) get_comments([
            'count'  => true,
            'status' => 'approve',
            'parent' => (int) $comment->comment_ID,
        ]);

        return [
            'post'        => $post,
            'author'      => $author,
            'reply_count' => $reply_count,
        ];
    }
}
