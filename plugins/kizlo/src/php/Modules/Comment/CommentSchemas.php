<?php

namespace Kizlo\Modules\Comment;

use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\CoreSchemas;
use WP_REST_Comments_Controller;

/**
 * What `POST /comments` returns.
 *
 * The comment itself is core's, prepared by `WP_REST_Comments_Controller`, so
 * the fields come off that controller rather than a list written here. What
 * Kizlo adds is the `kizlo` block {@see CommentModule::prepare()} attaches to
 * every comment response.
 *
 * The context is `view`, which is what the controller falls back to when the
 * request carries no `context`, and this route sends it none. That is the
 * difference from managed content, where the API class pins `edit` before the
 * controller runs.
 */
final class CommentSchemas
{
    public const COMMENT = 'kizlo.comment';

    /** The context the submission response is prepared in. */
    private const CONTEXT = 'view';

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [self::COMMENT => self::comment()];
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
