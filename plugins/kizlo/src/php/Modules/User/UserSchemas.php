<?php

namespace Kizlo\Modules\User;

use Kizlo\Modules\Introspection\CoreItemSchema;
use WP_REST_Users_Controller;

/**
 * What the user routes return and accept.
 *
 * Every operation on `/users/{field}/{value}` hands off to
 * `WP_REST_Users_Controller`, so both halves come off that controller: the item
 * schema for the response, and the write arguments core registers its own user
 * routes with for the update. On top sits the `kizlo` block
 * {@see UserExtension::prepare()} adds to every user response.
 *
 * The context is `edit`, pinned by {@see UserApi} on the request it hands the
 * controller. Core nests its contexts, so the widest one means every field the
 * controller can produce is produced and described, and no query parameter
 * decides which shape comes back.
 */
final class UserSchemas
{
    public const USER = 'kizlo.user';
    public const EXTERNAL_USER_DELETION = 'kizlo.external-user-deletion';

    /** The fields a user can be addressed by. */
    public const FIELDS = ['id', 'email', 'username'];

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            self::USER                   => self::user(),
            self::EXTERNAL_USER_DELETION => self::externalUserDeletion(),
        ];
    }

    /**
     * The path parameters every operation on this route takes.
     *
     * `value` is a string whatever `field` is: the route matches an ID, an email
     * and a login with one pattern, and the contract never reads a type off a
     * regex.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function identifier(): array
    {
        return [
            'field' => ['type' => 'string', 'required' => true, 'enum' => self::FIELDS],
            'value' => ['type' => 'string', 'required' => true, 'description' => 'The ID, email address or login, URL-encoded.'],
        ];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function externalIdentifier(): array
    {
        return [
            'provider' => [
                'type'              => 'string',
                'required'          => true,
                'description'       => 'External identity provider key.',
                'validate_callback' => static fn($value) => is_string($value) && preg_match('/^[a-z0-9][a-z0-9_-]*$/', $value) === 1,
                'sanitize_callback' => 'sanitize_key',
            ],
            'value' => [
                'type'              => 'string',
                'required'          => true,
                'description'       => 'Stable provider user identifier.',
                'validate_callback' => static fn($value) => is_string($value) && trim($value) !== '',
                'sanitize_callback' => 'sanitize_text_field',
            ],
        ];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function externalProfileInput(): array
    {
        return [
            'email' => [
                'type'              => 'string',
                'format'            => 'email',
                'required'          => true,
                'sanitize_callback' => 'sanitize_email',
            ],
            'first_name' => [
                'type'              => 'string',
                'required'          => true,
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'last_name' => [
                'type'              => 'string',
                'required'          => true,
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'profile' => [
                'type'                 => 'object',
                'required'             => true,
                'additionalProperties' => true,
                'description'          => 'Provider-owned profile metadata.',
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function user(): array
    {
        $properties = CoreItemSchema::responseForController(new WP_REST_Users_Controller(), '/users');

        $properties['kizlo'] = [
            'type'       => 'object',
            'required'   => true,
            'properties' => [
                'extend' => [
                    'type'                 => 'object',
                    'required'             => true,
                    'additionalProperties' => true,
                    'description'          => 'Whatever the kizlo_extend_user filters contributed.',
                ],
            ],
        ];

        return [
            'type'        => 'object',
            'description' => 'A WordPress user, with the Kizlo block the user extension adds.',
            'properties'  => $properties,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function externalUserDeletion(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Whether the mapped WordPress account was deleted.',
            'properties'  => [
                'deleted' => ['type' => 'boolean', 'required' => true],
            ],
        ];
    }
}
