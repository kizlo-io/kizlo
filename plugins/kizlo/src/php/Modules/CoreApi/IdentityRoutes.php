<?php

namespace Kizlo\Modules\CoreApi;

use Kizlo\Modules\Introspection\CoreAction;
use Kizlo\Modules\Introspection\CoreIdentifier;
use Kizlo\Modules\Introspection\CoreResource;
use Kizlo\Modules\Introspection\CoreRouteArgs;
use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Introspection\Spec;
use WP_REST_Application_Passwords_Controller;
use WP_REST_Settings_Controller;
use WP_REST_Users_Controller;

/**
 * The `wp/v2` user, application password and settings contracts.
 *
 * Three resources that share a subject and share nothing else structurally, and
 * between them they are why {@see CoreResource} stopped assuming five operations
 * behind a numeric id.
 *
 * `users` is the five plus `/users/me`, which core registers with the full
 * read-write-delete set rather than as a read — so it is three actions, not one.
 * `applicationPasswords` hangs off a parent whose pattern is a union of digits
 * and the literal `me`, addresses an item by uuid, and registers a delete on the
 * collection that answers with a count instead of a record. `settings` is a
 * singleton: no identifier at all, and core updates it with `POST`.
 */
final class IdentityRoutes
{
    public const USERS                = 'users';
    public const APPLICATION_PASSWORDS = 'applicationPasswords';
    public const SETTINGS             = 'settings';

    /** Core matches either a user ID or the literal `me` on the parent segment. */
    private const USER_SCOPE = '(?:[\d]+|me)';

    public static function register(): void
    {
        foreach (self::resources() as $id => $factory) {
            foreach ($factory()->operations() as $operation) {
                kizlo_register_route_spec(
                    static fn(): array => self::resources()[$id]()->operation($operation),
                );
            }
        }
    }

    /**
     * @return array<string, callable(): CoreResource>
     */
    private static function resources(): array
    {
        return [
            self::USERS                 => static fn(): CoreResource => self::users(),
            self::APPLICATION_PASSWORDS => static fn(): CoreResource => self::applicationPasswords(),
            self::SETTINGS              => static fn(): CoreResource => self::settings(),
        ];
    }

    /**
     * `/users/me` is the same controller answering for whoever is authenticated,
     * so it reads, writes and deletes exactly as the numeric route does. It is
     * described as three actions rather than folded into the five, because the
     * route takes no id and a generated client should not have to pass one.
     */
    private static function users(): CoreResource
    {
        $me = static fn(string $method): \Closure => static fn(): array => CoreRouteArgs::forRoute('wp/v2', '/users/me', $method);

        return new CoreResource(
            id: self::USERS,
            namespace: 'wp/v2',
            base: '/users',
            controller: new WP_REST_Users_Controller(),
            item: IdentitySchemas::USER,
            noun: 'user',
            plural: 'users',
            operations: [...CoreResource::CRUD, 'retrieve_me', 'update_me', 'delete_me'],
            identifier: CoreIdentifier::numeric('user'),
            deleted: IdentitySchemas::USER_DELETED,
            force: 'Required. A user is not trashable, so a delete is always permanent.',
            errors: self::userErrors(),
            extra: ['delete' => self::reassign(), 'delete_me' => self::reassign()],
            actions: [
                'retrieve_me' => new CoreAction(
                    method: 'GET',
                    route: '/users/me',
                    summary: 'Retrieve the authenticated user',
                    input: $me('GET'),
                    responses: ['200' => ['description' => 'The authenticated user.', 'body' => ['$ref' => IdentitySchemas::USER]]],
                ),
                'update_me' => new CoreAction(
                    method: 'POST',
                    route: '/users/me',
                    summary: 'Update the authenticated user',
                    input: $me('POST'),
                    responses: ['200' => ['description' => 'The updated user.', 'body' => ['$ref' => IdentitySchemas::USER]]],
                    contentType: Spec::JSON_CONTENT_TYPE,
                ),
                'delete_me' => new CoreAction(
                    method: 'DELETE',
                    route: '/users/me',
                    summary: 'Delete the authenticated user',
                    input: $me('DELETE'),
                    responses: ['200' => ['description' => 'The deletion result.', 'body' => ['$ref' => IdentitySchemas::USER_DELETED]]],
                ),
            ],
        );
    }

    private static function applicationPasswords(): CoreResource
    {
        $parent = CoreIdentifier::named(
            'user_id',
            'user',
            self::USER_SCOPE,
            'The user the passwords belong to, either an ID or the literal "me".',
        );

        $base = sprintf('/users/(?P<user_id>%s)/application-passwords', self::USER_SCOPE);

        return new CoreResource(
            id: self::APPLICATION_PASSWORDS,
            namespace: 'wp/v2',
            base: $base,
            controller: new WP_REST_Application_Passwords_Controller(),
            item: IdentitySchemas::PASSWORD,
            noun: 'application password',
            plural: 'application passwords',
            operations: [...CoreResource::CRUD, 'delete_all', 'introspect'],
            identifier: CoreIdentifier::named('uuid', 'application password', '[\w\-]+', 'The application password UUID.'),
            parents: [$parent],
            deleted: IdentitySchemas::PASSWORD_DELETED,
            deletedAll: IdentitySchemas::PASSWORDS_REVOKED,
            errors: self::passwordErrors(),
            actions: [
                'introspect' => new CoreAction(
                    method: 'GET',
                    route: $base . '/introspect',
                    summary: 'Retrieve the application password being used now',
                    input: static fn(): array => $parent->property()
                        + CoreRouteArgs::forRoute('wp/v2', $base . '/introspect', 'GET'),
                    responses: [
                        '200' => ['description' => 'The application password this request authenticated with.', 'body' => ['$ref' => IdentitySchemas::PASSWORD]],
                        '404' => ['description' => 'The request did not authenticate with an application password.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                    ],
                ),
            ],
        );
    }

    /**
     * A singleton, and the only resource here without an identifier. Core serves
     * it whether or not anything has been written, so it has no 404 to describe,
     * and registers the write as `POST` rather than `PATCH`.
     */
    private static function settings(): CoreResource
    {
        return new CoreResource(
            id: self::SETTINGS,
            namespace: 'wp/v2',
            base: '/settings',
            controller: new WP_REST_Settings_Controller(),
            item: IdentitySchemas::SETTINGS,
            noun: 'settings record',
            plural: 'settings',
            operations: ['retrieve', 'update'],
            errors: ['update' => ['rest_invalid_stored_value']],
        );
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function reassign(): array
    {
        return [
            'reassign' => [
                'type'        => 'integer',
                'required'    => true,
                'nullable'    => true,
                'description' => 'The user to reassign the deleted user\'s posts to, or null to delete them.',
            ],
        ];
    }

    /**
     * `WP_REST_Users_Controller`. The reads drop `rest_forbidden_context` because
     * no operation declares a `context`, and keep the codes raised beside it.
     *
     * @return array<string, array<int, string>>
     */
    private static function userErrors(): array
    {
        $write = [
            'rest_user_invalid_password',
            'rest_user_invalid_role',
            'rest_user_invalid_username',
        ];

        $delete = [
            'rest_cannot_delete',
            'rest_trash_not_supported',
            'rest_user_cannot_delete',
            'rest_user_invalid_reassign',
        ];

        return [
            'list' => [
                'rest_forbidden_orderby',
                'rest_forbidden_who',
                'rest_user_cannot_view',
            ],
            'retrieve' => [
                'rest_user_cannot_view',
                'rest_user_invalid_id',
            ],
            'create' => [
                ...$write,
                'rest_cannot_create_user',
                'rest_user_create',
                'rest_user_exists',
            ],
            'update' => [
                ...$write,
                'rest_cannot_edit',
                'rest_cannot_edit_roles',
                'rest_user_invalid_argument',
                'rest_user_invalid_email',
                'rest_user_invalid_id',
                'rest_user_invalid_slug',
            ],
            'delete'      => [...$delete, 'rest_user_invalid_id'],
            'retrieve_me' => ['rest_not_logged_in'],
            'update_me'   => [...$write, 'rest_cannot_edit', 'rest_cannot_edit_roles', 'rest_not_logged_in', 'rest_user_invalid_argument', 'rest_user_invalid_email', 'rest_user_invalid_slug'],
            'delete_me'   => [...$delete, 'rest_not_logged_in'],
        ];
    }

    /**
     * `WP_REST_Application_Passwords_Controller`. Every operation resolves the
     * parent user first, so every one of them carries what `get_user()` raises:
     * the feature being switched off globally or for that user, an unauthenticated
     * caller asking for `me`, and an unknown ID.
     *
     * @return array<string, array<int, string>>
     */
    private static function passwordErrors(): array
    {
        $user = [
            'application_passwords_disabled',
            'application_passwords_disabled_for_user',
            'rest_cannot_manage_application_passwords',
            'rest_not_logged_in',
            'rest_user_invalid_id',
        ];

        $single = [...$user, 'rest_application_password_not_found'];

        return [
            'list'       => [...$user, 'rest_cannot_list_application_passwords'],
            'retrieve'   => [...$single, 'rest_cannot_read_application_password'],
            'create'     => [...$user, 'rest_cannot_create_application_passwords'],
            'update'     => [...$single, 'rest_cannot_edit_application_password'],
            'delete'     => [...$single, 'rest_cannot_delete_application_password'],
            'delete_all' => [...$user, 'rest_cannot_delete_application_passwords'],
            'introspect' => [
                ...$single,
                'rest_cannot_introspect_app_password_for_non_authenticated_user',
                'rest_no_authenticated_app_password',
            ],
        ];
    }
}
