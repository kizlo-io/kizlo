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

    /** The fields a user can be addressed by. */
    public const FIELDS = ['id', 'email', 'username'];

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [self::USER => self::user()];
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
}
