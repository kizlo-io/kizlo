<?php

namespace Kizlo\Modules\User;

use WP_User;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Users_Controller;

class UserApi
{
    private const ALLOWED_FIELDS = ['id', 'email', 'username'];

    public function register()
    {
        kizlo_register_route([
            'methods'  => ['GET', 'POST', 'DELETE'],
            'route'    => kizlo_route('/users/:field/:value'),
            'callback' => function (WP_REST_Request $request) {
                $field  = $request->get_param('field');
                $value = urldecode($request->get_param('value'));
                $method = $request->get_method();

                if (!in_array($field, self::ALLOWED_FIELDS, true)) {
                    return new WP_Error(
                        'invalid_field',
                        sprintf(__('Invalid field "%s". Allowed fields: id, email, username.'), $field),
                        ['status' => 400]
                    );
                }

                if ($field === 'id') {
                    $userId = (int) $value;
                } else {
                    $user = $this->getUserByField($field, $value);

                    if (is_wp_error($user)) {
                        return $user;
                    }

                    $userId = $user->ID;
                }

                $controller = new WP_REST_Users_Controller();
                $getRequest = new WP_REST_Request('GET');
                $getRequest->set_param('id', $userId);
                $getRequest->set_param('context', 'edit');

                return match ($method) {
                    'GET'    => $controller->get_item($getRequest),
                    'POST'   => $this->updateUser($userId, $request),
                    'DELETE' => $this->deleteUser($userId, ($request->get_json_params() ?: [])['reassign'] ?? null),
                    default  => new WP_Error('invalid_method', __('Method not allowed.'), ['status' => 405]),
                };
            }
        ]);
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

        $result = $controller->delete_item($request);

        if (is_wp_error($result)) return $result;

        return rest_ensure_response($result->get_data()['previous']);
    }

    public function verifyUserCredentials(string $username, string $password): array | WP_Error
    {
        // Attempt to get the user by login or email.
        $user = get_user_by('login', $username);

        if (! $user) {
            $user = get_user_by('email', $username);
        }

        // Unknown username / email.
        if (! $user) {
            return new WP_Error('invalid_credentials', 'No account exists with that username or email.', ['status' => 404]);
        }

        // Verify the password against the stored hash.
        if (! wp_check_password($password, $user->user_pass, $user->ID)) {
            return new WP_Error('invalid_credentials', 'The password you entered is incorrect.', ['status' => 401]);
        }

        $controller = new WP_REST_Users_Controller();
        $user_request = new WP_REST_Request('GET');
        $user_request->set_param('context', 'edit');

        $data = $controller->prepare_item_for_response($user, $user_request);

        return $controller->prepare_response_for_collection($data);
    }
}
