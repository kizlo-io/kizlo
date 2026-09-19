<?php

namespace Kizlo\Modules\CoreApi;

use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\CoreResource;
use WP_REST_Application_Passwords_Controller;
use WP_REST_Settings_Controller;
use WP_REST_Users_Controller;

/**
 * What core's user, application password and settings resources return.
 *
 * `kizlo.user` already describes the user Kizlo's own `kizlo/v1` routes return,
 * which is a different shape built for a different purpose, so core's is
 * `kizlo.wp-user`. {@see ContentSchemas} explains the prefix.
 *
 * Settings is derived like everything else, and that means it describes whatever
 * `register_setting()` has published on this WordPress — core's `title`, `url`
 * and `posts_per_page` alongside any a plugin registered with `show_in_rest`.
 * That is not leakage into the contract; it is what `wp/v2/settings` actually
 * serves here, and narrowing it to a core-only list would describe a route
 * WordPress is not running.
 */
final class IdentitySchemas
{
    public const USER     = 'kizlo.wp-user';
    public const PASSWORD = 'kizlo.wp-application-password';
    public const SETTINGS = 'kizlo.wp-settings';

    public const USER_DELETED      = 'kizlo.wp-user-deleted';
    public const PASSWORD_DELETED  = 'kizlo.wp-application-password-deleted';
    public const PASSWORDS_REVOKED = 'kizlo.wp-application-passwords-revoked';

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            self::USER => [
                'type'        => 'object',
                'description' => 'A user, as WordPress core returns it.',
                'properties'  => CoreItemSchema::responseForController(
                    new WP_REST_Users_Controller(),
                    '/users',
                    CoreResource::CONTEXT,
                ),
            ],
            self::PASSWORD => [
                'type'        => 'object',
                'description' => 'An application password.',
                'properties'  => CoreItemSchema::responseForController(
                    new WP_REST_Application_Passwords_Controller(),
                    '/users/{user_id}/application-passwords',
                    CoreResource::CONTEXT,
                ),
            ],
            self::SETTINGS => [
                'type'        => 'object',
                'description' => 'The settings registered for the REST API on this WordPress.',
                'properties'  => CoreItemSchema::responseForController(
                    new WP_REST_Settings_Controller(),
                    '/settings',
                    CoreResource::CONTEXT,
                ),
            ],

            // Neither a user nor an application password is trashable, so both
            // deletes always report what they removed.
            self::USER_DELETED     => DeletedSchema::permanent(self::USER),
            self::PASSWORD_DELETED => DeletedSchema::permanent(self::PASSWORD),

            // Revoking every password at once has no single record to hand back.
            self::PASSWORDS_REVOKED => [
                'type'       => 'object',
                'properties' => [
                    'deleted' => ['type' => 'boolean', 'required' => true],
                    'count'   => [
                        'type'        => 'integer',
                        'required'    => true,
                        'description' => 'How many application passwords were revoked.',
                    ],
                ],
            ],
        ];
    }
}
