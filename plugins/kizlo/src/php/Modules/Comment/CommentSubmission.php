<?php

namespace Kizlo\Modules\Comment;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Comments_Controller;
use Kizlo\Modules\Auth\AuthModule;
use Kizlo\Modules\Auth\Identity;
use Kizlo\Modules\Auth\RequestMetadata;
use Kizlo\Modules\Captcha\Captcha;

/** Submit browser comments through WordPress moderation, flood and spam checks. */
class CommentSubmission
{
    public function register(): void
    {
        kizlo_register_route([
            // Every route this plugin registers is qualified; `comments` is left
            // to WordPress. {@see CommentRoutes} for why core keeps the plain ID.
            'id'        => 'kizlo.comments',
            'operation' => 'create',
            'access' => 'public',
            'method'    => 'POST',
            'route'     => '/comments',
            'summary'   => 'Submit a comment through the native pipeline',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'post_id' => [
                        'type'              => 'integer',
                        'required'          => true,
                        'validate_callback' => static fn($v) => is_numeric($v) && (int) $v > 0,
                        'sanitize_callback' => 'absint',
                    ],
                    'content' => [
                        'type'              => 'string',
                        'required'          => true,
                        'validate_callback' => static fn($v) => is_string($v) && trim($v) !== '',
                        'sanitize_callback' => 'wp_kses_post',
                    ],
                    'parent' => [
                        'type'              => 'integer',
                        'default'           => 0,
                        'description'       => 'The comment being replied to.',
                        'sanitize_callback' => 'absint',
                    ],
                    'captcha_token' => ['type' => 'string', 'maxLength' => 16384],
                    'author_name' => [
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'author_email' => [
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_email',
                    ],
                    'author_url' => [
                        'type'              => 'string',
                        'sanitize_callback' => 'esc_url_raw',
                    ],
                ],
            ],
            'errors'    => [
                'kizlo_captcha_required', 'kizlo_captcha_invalid', 'kizlo_captcha_unavailable', 'kizlo_forbidden_identity',
                'comment_author_column_length',
                'comment_author_email_column_length',
                'comment_author_url_column_length',
                'comment_closed',
                'comment_content_column_length',
                'comment_duplicate',
                'comment_flood',
                'comment_id_not_found',
                'comment_on_draft',
                'comment_on_password_protected',
                'comment_on_trash',
                'comment_reply_to_unapproved_comment',
                'comment_save_error',
                'not_logged_in',
                'require_name_email',
                'require_valid_comment',
                'require_valid_email',
            ],
            'responses' => CommentSchemas::submitResponses(),
            'callback'  => [$this, 'submit'],
        ]);
    }

    public function submit(WP_REST_Request $request): WP_REST_Response | WP_Error
    {
        $identity = AuthModule::identity($request);
        if ($identity instanceof WP_Error) return $identity;
        $author = false;
        if ($identity instanceof Identity && $identity->emailVerified && $identity->email !== null) {
            $author = get_user_by('email', $identity->email);
            if ($author && (user_can($author, 'edit_posts') || user_can($author, 'manage_options'))) {
                return new WP_Error('kizlo_forbidden_identity', 'This account cannot be selected by external email.', ['status' => 403]);
            }
        } elseif ($identity === null && !kizlo_is_application_password_authenticated() && is_user_logged_in()) {
            $author = wp_get_current_user();
        }
        $verified = $identity instanceof Identity && $identity->emailVerified && $identity->email !== null;
        if (!$author && !$verified && !(kizlo_is_application_password_authenticated() && current_user_can('manage_options'))) {
            $captcha = Captcha::verify($request->get_param('captcha_token'));
            if ($captcha instanceof WP_Error) return $captcha;
        }
        $comment_data = [
            'comment_post_ID' => (int) $request->get_param('post_id'),
            'comment_parent'  => (int) $request->get_param('parent'),
            'comment'         => (string) $request->get_param('content'),
            'author'          => (string) $request->get_param('author_name'),
            'email'           => (string) $request->get_param('author_email'),
            'url'             => (string) $request->get_param('author_url'),
        ];

        if ($verified) $comment_data['email'] = $identity->email;

        $orig_remote_addr = $_SERVER['REMOTE_ADDR']     ?? null;
        $orig_user_agent  = $_SERVER['HTTP_USER_AGENT'] ?? null;
        $orig_user_id     = get_current_user_id();

        $_SERVER['REMOTE_ADDR'] = RequestMetadata::ip();
        $_SERVER['HTTP_USER_AGENT'] = substr((string) ($orig_user_agent ?? ''), 0, 254);

        wp_set_current_user($author ? (int) $author->ID : 0);

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

        $request->set_param('context', 'view');
        $controller = new WP_REST_Comments_Controller();
        $response   = $controller->prepare_item_for_response($result, $request);
        $response->set_status(200);

        return $response;
    }
}
