<?php

namespace Kizlo\Modules\Comment;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Comments_Controller;

/**
 * SDK comment-submission endpoint.
 *
 * The SDK reaches the Kizlo REST API authenticated as the admin via an
 * Application Password. Hitting POST /wp/v2/comments in that context bypasses
 * the public comment pipeline: moderation, flood checks, disallowed-list, and
 * spam filters all assume a real end-user request, and the row ends up with
 * the WP server's IP, an empty user-agent, and the admin as the author.
 *
 * This endpoint re-enters the native pipeline via wp_handle_comment_submission()
 * after temporarily swapping the request environment so the real client IP /
 * user-agent reach every downstream consumer (Akismet reads $_SERVER directly)
 * and the commenter is either a forwarded WP user or a guest — never the admin
 * that owns the App Password.
 */
class CommentSubmission
{
    public function register(): void
    {
        kizlo_register_route([
            'methods'  => 'POST',
            'route'    => '/comments',
            'callback' => [$this, 'submit'],
            'args'     => [
                'post_id' => [
                    'required'          => true,
                    'type'              => 'integer',
                    'validate_callback' => static fn($v) => is_numeric($v) && (int) $v > 0,
                    'sanitize_callback' => 'absint',
                ],
                'content' => [
                    'required'          => true,
                    'type'              => 'string',
                    'validate_callback' => static fn($v) => is_string($v) && trim($v) !== '',
                    'sanitize_callback' => 'wp_kses_post',
                ],
                'parent' => [
                    'required'          => false,
                    'type'              => 'integer',
                    'default'           => 0,
                    'sanitize_callback' => 'absint',
                ],
                'user_id' => [
                    'required'          => false,
                    'type'              => 'integer',
                    'sanitize_callback' => 'absint',
                ],
                'author_name' => [
                    'required'          => false,
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ],
                'author_email' => [
                    'required'          => false,
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_email',
                ],
                'author_url' => [
                    'required'          => false,
                    'type'              => 'string',
                    'sanitize_callback' => 'esc_url_raw',
                ],
                'author_ip' => [
                    'required'          => true,
                    'type'              => 'string',
                    'validate_callback' => static fn($v) => is_string($v) && filter_var($v, FILTER_VALIDATE_IP) !== false,
                    'sanitize_callback' => 'sanitize_text_field',
                ],
                'user_agent' => [
                    'required'          => true,
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ],
            ],
        ]);
    }

    public function submit(WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        $user_id = (int) $request->get_param('user_id');
        if ($user_id > 0 && ! get_userdata($user_id)) {
            return new WP_Error(
                'kizlo_invalid_user',
                'The supplied user_id does not match any WordPress user.',
                ['status' => 400]
            );
        }

        $comment_data = [
            'comment_post_ID' => (int) $request->get_param('post_id'),
            'comment_parent'  => (int) $request->get_param('parent'),
            'comment'         => (string) $request->get_param('content'),
            'author'          => (string) $request->get_param('author_name'),
            'email'           => (string) $request->get_param('author_email'),
            'url'             => (string) $request->get_param('author_url'),
        ];

        $orig_remote_addr = $_SERVER['REMOTE_ADDR']     ?? null;
        $orig_user_agent  = $_SERVER['HTTP_USER_AGENT'] ?? null;
        $orig_user_id     = get_current_user_id();

        $_SERVER['REMOTE_ADDR']     = (string) $request->get_param('author_ip');
        $_SERVER['HTTP_USER_AGENT'] = substr((string) $request->get_param('user_agent'), 0, 254);

        wp_set_current_user($user_id > 0 ? $user_id : 0);

        try {
            $result = wp_handle_comment_submission($comment_data);
        } finally {
            if ($orig_remote_addr === null) {
                unset($_SERVER['REMOTE_ADDR']);
            } else {
                $_SERVER['REMOTE_ADDR'] = $orig_remote_addr;
            }
            if ($orig_user_agent === null) {
                unset($_SERVER['HTTP_USER_AGENT']);
            } else {
                $_SERVER['HTTP_USER_AGENT'] = $orig_user_agent;
            }
            wp_set_current_user($orig_user_id);
        }

        if (is_wp_error($result)) {
            $data   = $result->get_error_data();
            $status = is_array($data) && isset($data['status']) ? (int) $data['status'] : 400;
            $result->add_data(['status' => $status]);
            return $result;
        }

        $controller = new WP_REST_Comments_Controller();
        $response   = $controller->prepare_item_for_response($result, $request);
        $response->set_status(200);

        return $response;
    }
}
