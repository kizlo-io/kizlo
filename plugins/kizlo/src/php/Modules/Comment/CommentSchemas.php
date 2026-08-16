<?php

namespace Kizlo\Modules\Comment;

use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\CoreSchemas;
use WP_REST_Comments_Controller;

/**
 * What a comment looks like coming back from this site, on any route.
 *
 * The comment itself is core's, prepared by `WP_REST_Comments_Controller`, so
 * the fields come off that controller rather than a list written here. What
 * Kizlo adds is the `kizlo` block {@see CommentModule::prepare()} attaches to
 * every comment response.
 *
 * One schema covers `POST /kizlo/v1/comments` and the described `wp/v2/comments`
 * operations alike, because all of them end at the same controller in the same
 * context and pass through the same `rest_prepare_comment` filter on the way out.
 * The submission route sends no `context` and the described routes cannot send
 * one, so `view` is what every one of them is prepared in.
 * {@see \Kizlo\Modules\Introspection\CoreResource} explains why leaving the
 * parameter undeclared is what makes that true rather than merely likely.
 */
final class CommentSchemas
{
    public const COMMENT = 'kizlo.comment';

    /** What a delete answers with, which depends on whether it trashed or removed. */
    public const DELETED = 'kizlo.comment-deleted';

    /** The context every comment response is prepared in. */
    private const CONTEXT = 'view';

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            self::COMMENT => self::comment(),
            self::DELETED => self::deleted(),
        ];
    }

    /**
     * A comment delete either trashes it, returning the trashed comment, or
     * removes it for good, returning the result with the comment it removed.
     * Which one happens is decided by `force`, so both shapes are described.
     *
     * @return array<string, mixed>
     */
    private static function deleted(): array
    {
        return [
            'anyOf' => [
                ['$ref' => self::COMMENT],
                [
                    'type'       => 'object',
                    'properties' => [
                        'deleted'  => ['type' => 'boolean', 'required' => true],
                        'previous' => ['$ref' => self::COMMENT, 'required' => true],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function comment(): array
    {
        $properties = CoreItemSchema::responseForController(
            new WP_REST_Comments_Controller(),
            '/comments',
            self::CONTEXT,
        );

        $properties['kizlo'] = self::envelope();

        return [
            'type'        => 'object',
            'description' => 'A comment, with the Kizlo block the comment extension adds.',
            'properties'  => $properties,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function envelope(): array
    {
        return [
            'type'       => 'object',
            'required'   => true,
            'properties' => [
                'post'        => [
                    'type'        => 'object',
                    'required'    => true,
                    'nullable'    => true,
                    'description' => 'Null when the commented post no longer exists.',
                    'properties'  => [
                        'id'             => ['type' => 'integer', 'required' => true],
                        'slug'           => ['type' => 'string', 'required' => true],
                        'title'          => ['type' => 'string', 'required' => true],
                        'featured_image' => [
                            'type'        => 'object',
                            'required'    => true,
                            'nullable'    => true,
                            'description' => 'Null when the post has no featured image.',
                            'properties'  => [
                                'id'  => ['type' => 'integer', 'required' => true],
                                'url' => ['type' => 'string', 'required' => true, 'nullable' => true, 'format' => 'uri'],
                                'alt' => ['type' => 'string', 'required' => true],
                            ],
                        ],
                    ],
                ],
                'author'      => [
                    'type'        => 'object',
                    'required'    => true,
                    'nullable'    => true,
                    'description' => 'Null for a guest comment, or when the account behind it is gone.',
                    'properties'  => [
                        'id'         => ['type' => 'integer', 'required' => true],
                        'name'       => ['type' => 'string', 'required' => true],
                        'slug'       => ['type' => 'string', 'required' => true],
                        'avatar_url' => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                    ],
                ],
                'reply_count' => ['type' => 'integer', 'required' => true, 'description' => 'Approved direct replies.'],
                'extend'      => [
                    'type'                 => 'object',
                    'required'             => true,
                    'additionalProperties' => true,
                    'description'          => 'Whatever the kizlo_extend_comment filters contributed.',
                ],
            ],
        ];
    }

    /**
     * @return array<array-key, array<string, mixed>>
     */
    public static function submitResponses(): array
    {
        // Everything the comment pipeline refuses arrives as 400, including the
        // ones core raises with a 403 or 429 of their own: it puts those in the
        // error data as a bare int, which {@see CommentSubmission::submit()}
        // cannot read as a status and replaces.
        return [
            '200' => ['description' => 'The submitted comment, approved or held for moderation.', 'body' => ['$ref' => self::COMMENT]],
            '400' => ['description' => 'The submission was rejected, by validation or by the comment pipeline.', 'body' => ['$ref' => CoreSchemas::ERROR]],
        ];
    }
}
