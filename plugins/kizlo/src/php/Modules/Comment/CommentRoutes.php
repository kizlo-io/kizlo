<?php

namespace Kizlo\Modules\Comment;

use Kizlo\Modules\Introspection\CoreResource;
use WP_REST_Comments_Controller;

/**
 * The `wp/v2/comments` contract.
 *
 * Kizlo does not serve these routes, WordPress does. They are described because
 * Kizlo consumes two of them and because a resource half-described is worse than
 * one not described at all: a generated client that can read a comment but not
 * delete one sends the reader looking for the raw transport, which is the habit
 * the generated tree exists to break.
 *
 * The API ID is `comments` rather than something qualified, and the submission
 * route this plugin does own moved to `kizlo.comments` to make room for it. The
 * generated client should mirror WordPress where WordPress owns the route, and
 * mark the Kizlo addition as the addition it is.
 */
final class CommentRoutes
{
    public const API_ID = 'comments';

    public static function register(): void
    {
        foreach (['list', 'retrieve', 'create', 'update', 'delete'] as $operation) {
            kizlo_register_route_spec(
                static fn(): array => self::resource()->operation($operation),
            );
        }
    }

    private static function resource(): CoreResource
    {
        static $resource = null;

        return $resource ??= new CoreResource(
            id: self::API_ID,
            namespace: 'wp/v2',
            base: '/comments',
            controller: new WP_REST_Comments_Controller(),
            item: CommentSchemas::COMMENT,
            deleted: CommentSchemas::DELETED,
            noun: 'comment',
            plural: 'comments',
            force: 'Whether to bypass the trash and delete permanently. Without it a trashable comment is trashed and returned.',
            errors: self::errors(),
            extra: self::extra(),
            notes: self::notes(),
        );
    }

    /**
     * The parameters core registers on these routes outside the item schema.
     *
     * `password` is the whole list. The collection already carries it through
     * `get_collection_params()`, so only the two single-comment routes need it
     * added: a comment on a password-protected post is legible to a caller that
     * can supply the post's password and to nobody else.
     *
     * @return array<string, array<string, array<string, mixed>>>
     */
    private static function extra(): array
    {
        $password = [
            'password' => [
                'type'        => 'string',
                'description' => 'The password of the post the comment is on, when that post is protected.',
            ],
        ];

        return ['retrieve' => $password, 'delete' => $password];
    }

    /**
     * @return array<string, string>
     */
    private static function notes(): array
    {
        return [
            'create' => 'Writes the comment directly, skipping the native submission pipeline: no moderation, '
                . 'no flood check, no disallowed-list and no spam filtering, with the comment attributed to the '
                . 'authenticated account and stamped with the calling server\'s address. Use the kizlo/v1 create '
                . 'operation for anything a real person submitted.',
        ];
    }

    /**
     * Read off `WP_REST_Comments_Controller`, per operation. The shared
     * pre-dispatch codes are not here; {@see \Kizlo\Modules\Introspection\OperationErrors}
     * adds those to every described route.
     *
     * @return array<string, array<int, string>>
     */
    private static function errors(): array
    {
        return [
            'list' => [
                'rest_cannot_read',
                'rest_cannot_read_post',
                'rest_comment_not_supported_post_type',
                'rest_forbidden_context',
                'rest_forbidden_param',
            ],
            'retrieve' => [
                'rest_cannot_read',
                'rest_cannot_read_post',
                'rest_comment_invalid_id',
                'rest_forbidden_context',
                'rest_post_invalid_id',
            ],
            'create' => [
                'rest_cannot_create_note',
                'rest_cannot_read_post',
                'rest_comment_author_data_required',
                'rest_comment_closed',
                'rest_comment_content_invalid',
                'rest_comment_draft_post',
                'rest_comment_exists',
                'rest_comment_failed_create',
                'rest_comment_invalid_author',
                'rest_comment_invalid_author_ip',
                'rest_comment_invalid_post_id',
                'rest_comment_invalid_status',
                'rest_comment_login_required',
                'rest_comment_not_supported_post_type',
                'rest_comment_trash_post',
                'rest_invalid_comment_type',
            ],
            'update' => [
                'rest_cannot_edit',
                'rest_comment_content_invalid',
                'rest_comment_failed_edit',
                'rest_comment_invalid_id',
                'rest_comment_invalid_post_id',
                'rest_comment_invalid_type',
                'rest_post_invalid_id',
            ],
            'delete' => [
                'rest_already_trashed',
                'rest_cannot_delete',
                'rest_comment_author_invalid',
                'rest_comment_invalid_id',
                'rest_post_invalid_id',
                'rest_trash_not_supported',
            ],
        ];
    }
}
