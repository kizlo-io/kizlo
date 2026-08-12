<?php

namespace Kizlo\Modules\User;

use WP_User;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Users_Controller;
use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\CoreSchemas;

class UserApi
{
    private const ALLOWED_FIELDS = UserSchemas::FIELDS;

    /**
     * One route, addressed by ID, email or username, and three operations on it.
     *
     * They were one registration answering three methods, which the contract
     * cannot describe: a read, a write and a delete return different things and
     * take different bodies, and a generated client would have had one method
     * for all three. WordPress merges handlers registered against the same
     * route, so the runtime is unchanged.
     */
    public function register()
    {
        $route = kizlo_route('/users/:field/:value');

        kizlo_register_route([
            'id'        => 'users',
            'operation' => 'retrieve',
            'methods'   => 'GET',
            'route'     => $route,
            'summary'   => 'Retrieve a user by ID, email address or username',
            'input'     => ['type' => 'object', 'properties' => UserSchemas::identifier()],
            'responses' => self::responses(),
            'callback'  => fn(WP_REST_Request $request) => $this->resolve(
                $request,
                fn(int $userId) => $this->readUser($userId),
            ),
        ]);

        kizlo_register_route([
            'id'        => 'users',
            'operation' => 'update',
            'methods'   => 'POST',
            'route'     => $route,
            'summary'   => 'Update a user',
            'input'     => [
                'type'       => 'object',
                'properties' => UserSchemas::identifier() + CoreItemSchema::inputForController(
                    new WP_REST_Users_Controller(),
                    true,
                    '/users',
                ),
            ],
            'responses' => self::responses(),
            'callback'  => fn(WP_REST_Request $request) => $this->resolve(
                $request,
                fn(int $userId) => $this->updateUser($userId, $request),
            ),
        ]);

        kizlo_register_route([
            'id'        => 'users',
            'operation' => 'delete',
            'methods'   => 'DELETE',
            'route'     => $route,
            'summary'   => 'Delete a user',
            'input'     => [
                'type'       => 'object',
                'properties' => UserSchemas::identifier() + [
                    'reassign' => [
                        'type'        => 'integer',
                        'nullable'    => true,
                        'description' => 'User to reassign the deleted account\'s content to. Omitted deletes the content with it.',
                    ],
                ],
            ],
            'responses' => self::responses('The deleted user, as it was before deletion.'),
            'callback'  => fn(WP_REST_Request $request) => $this->resolve(
                $request,
                fn(int $userId) => $this->deleteUser($userId, ($request->get_json_params() ?: [])['reassign'] ?? null),
            ),
        ]);
    }

    /**
     * @return array<array-key, array<string, mixed>>
     */
    private static function responses(string $description = 'The user.'): array
    {
        return [
            '200' => ['description' => $description, 'body' => ['$ref' => UserSchemas::USER]],
            '400' => ['description' => 'Unknown field.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            '403' => ['description' => 'The account is the one the request authenticated as.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            '404' => ['description' => 'No user matches the field and value.', 'body' => ['$ref' => CoreSchemas::ERROR]],
        ];
    }

    /**
     * Turn the addressed field and value into a user ID, then run the operation.
     *
     * @param callable(int): (WP_REST_Response|WP_Error) $operation
     */
    private function resolve(WP_REST_Request $request, callable $operation): WP_REST_Response|WP_Error
    {
        $field = (string) $request->get_param('field');
        $value = urldecode((string) $request->get_param('value'));

        if (!in_array($field, self::ALLOWED_FIELDS, true)) {
            return new WP_Error(
                'invalid_field',
                sprintf(__('Invalid field "%s". Allowed fields: id, email, username.'), $field),
                ['status' => 400]
            );
        }

        if ($field === 'id') {
            return $operation((int) $value);
        }

        $user = $this->getUserByField($field, $value);

        if (is_wp_error($user)) {
            return $user;
        }

        return $operation($user->ID);
    }

    /**
     * Read through core's controller with the context pinned, so the response
     * carries every field it can produce rather than the narrower set a missing
     * `context` parameter would have selected.
     */
    private function readUser(int $userId): WP_REST_Response|WP_Error
    {
        $controller = new WP_REST_Users_Controller();
        $request    = new WP_REST_Request('GET');

        $request->set_param('id', $userId);
        $request->set_param('context', CoreItemSchema::CONTEXT);

        return $controller->get_item($request);
    }

    public function getUserByField(string $field, string $value): WP_User|WP_Error
    {
        if (!in_array($field, self::ALLOWED_FIELDS, true)) {
            return new WP_Error(
                'invalid_field',
                sprintf(__('Invalid field "%s". Allowed fields: id, email, username.'), $field),
                ['status' => 400]
            );
        }

        $user = match ($field) {
            'id'       => get_user_by('id', (int) $value),
            'email'    => get_user_by('email', $value),
            'username' => get_user_by('login', $value),
        };

        if (!$user instanceof WP_User) {
            return new WP_Error(
                'user_not_found',
                __('No user found matching the provided field and value.'),
                ['status' => 404]
            );
        }

        return $user;
    }

    public function updateUser(int $userId, WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $controller = new WP_REST_Users_Controller();

        $request->set_param('id', $userId);
        $request->set_param('context', CoreItemSchema::CONTEXT);

        return $controller->update_item($request);
    }

    public function deleteUser(int $userId, ?int $reassignTo = null): WP_REST_Response|WP_Error
    {
        if (get_current_user_id() === $userId) {
            return new WP_Error(
                'cannot_delete_self',
                __('You cannot delete your own account via the API.'),
                ['status' => 403]
            );
        }

        $controller = new WP_REST_Users_Controller();
        $request    = new WP_REST_Request('DELETE');

        $request->set_param('id', $userId);
        $request->set_param('force', true);
        $request->set_param('reassign', $reassignTo);
        $request->set_param('context', CoreItemSchema::CONTEXT);

        $result = $controller->delete_item($request);

        if (is_wp_error($result)) return $result;

        return rest_ensure_response($result->get_data()['previous']);
    }

    public function verifyUserCredentials(string $username, string $password): array | WP_Error
    {
        $user = get_user_by('login', $username);

        if (! $user) {
            $user = get_user_by('email', $username);
        }

        if (! $user) {
            return new WP_Error('invalid_credentials', 'No account exists with that username or email.', ['status' => 404]);
        }

        if (! wp_check_password($password, $user->user_pass, $user->ID)) {
            return new WP_Error('invalid_credentials', 'The password you entered is incorrect.', ['status' => 401]);
        }

        $controller = new WP_REST_Users_Controller();
        $user_request = new WP_REST_Request('GET');
        $user_request->set_param('context', CoreItemSchema::CONTEXT);

        $data = $controller->prepare_item_for_response($user, $user_request);

        return $controller->prepare_response_for_collection($data);
    }
}
