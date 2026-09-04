<?php

namespace Kizlo\Modules\User;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Users_Controller;
use WP_User;

class ExternalUserApi
{
    private const API_ID = 'users.external';
    private const MAPPING_PREFIX = '_kizlo_external_id_';
    private const PROFILE_PREFIX = '_kizlo_external_profile_';

    public function register(): void
    {
        $route = kizlo_route('/users/external/:provider/:value');
        $writeInput = [
            'type'       => 'object',
            'properties' => UserSchemas::externalIdentifier() + UserSchemas::externalProfileInput(),
        ];

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'create',
            'method'    => 'POST',
            'route'     => $route,
            'summary'   => 'Create or link a user by external provider identity',
            'input'     => $writeInput,
            'errors'    => self::writeErrors(),
            'responses' => self::userResponses(),
            'callback'  => [$this, 'create'],
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'update',
            'method'    => 'PUT',
            'route'     => $route,
            'summary'   => 'Update a user by external provider identity',
            'input'     => $writeInput,
            'errors'    => array_merge(self::writeErrors(), ['external_user_not_found']),
            'responses' => self::userResponses(true),
            'callback'  => [$this, 'update'],
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'delete',
            'method'    => 'DELETE',
            'route'     => $route,
            'summary'   => 'Delete a user by external provider identity',
            'input'     => ['type' => 'object', 'properties' => UserSchemas::externalIdentifier()],
            'errors'    => [
                'external_user_delete_failed',
                'external_user_identity_conflict',
                'external_user_lock_unavailable',
                'external_user_protected',
            ],
            'responses' => [
                '200' => ['description' => 'Whether a mapped account was deleted.', 'body' => ['$ref' => UserSchemas::EXTERNAL_USER_DELETION]],
                '403' => ['description' => 'The mapped account is protected.', 'body' => ['$ref' => \Kizlo\Modules\Introspection\CoreSchemas::ERROR]],
                '409' => ['description' => 'More than one account has the provider identity.', 'body' => ['$ref' => \Kizlo\Modules\Introspection\CoreSchemas::ERROR]],
                '500' => ['description' => 'WordPress could not delete the account.', 'body' => ['$ref' => \Kizlo\Modules\Introspection\CoreSchemas::ERROR]],
                '503' => ['description' => 'The account lock could not be acquired.', 'body' => ['$ref' => \Kizlo\Modules\Introspection\CoreSchemas::ERROR]],
            ],
            'callback'  => [$this, 'delete'],
        ]);
    }

    public function create(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $provider = (string) $request->get_param('provider');
        $value = urldecode((string) $request->get_param('value'));
        $email = (string) $request->get_param('email');

        return $this->withIdentityLocks($provider, $value, $email, function () use ($request, $provider, $value, $email) {
            $mapped = $this->getMappedUser($provider, $value);
            if (is_wp_error($mapped)) return $mapped;
            if ($mapped instanceof WP_User) return $this->updateExisting($mapped, $provider, $value, $request);

            $existing = get_user_by('email', $email);
            if ($existing instanceof WP_User) return $this->linkAndUpdate($existing, $provider, $value, $request);

            $userId = wp_insert_user([
                'user_login' => $this->availableLogin($email),
                'user_email' => $email,
                'user_pass'  => wp_generate_password(32, true, true),
                'first_name' => (string) $request->get_param('first_name'),
                'last_name'  => (string) $request->get_param('last_name'),
                'role'       => 'subscriber',
            ]);

            if (is_wp_error($userId)) {
                if (in_array($userId->get_error_code(), ['existing_user_email', 'existing_user_login'], true)) {
                    $mapped = $this->getMappedUser($provider, $value);
                    if (is_wp_error($mapped)) return $mapped;
                    if ($mapped instanceof WP_User) return $this->updateExisting($mapped, $provider, $value, $request);

                    $existing = get_user_by('email', $email);
                    if ($existing instanceof WP_User) return $this->linkAndUpdate($existing, $provider, $value, $request);
                }

                return new WP_Error('external_user_create_failed', $userId->get_error_message(), ['status' => 500]);
            }

            $user = get_user_by('id', $userId);
            if (!$user instanceof WP_User) {
                return new WP_Error('external_user_create_failed', __('WordPress created the account but could not read it back.'), ['status' => 500]);
            }

            $this->saveProviderData($user->ID, $provider, $value, $request);
            return $this->userResponse($user->ID);
        });
    }

    public function update(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $provider = (string) $request->get_param('provider');
        $value = urldecode((string) $request->get_param('value'));
        $email = (string) $request->get_param('email');

        return $this->withIdentityLocks($provider, $value, $email, function () use ($request, $provider, $value, $email) {
            $mapped = $this->getMappedUser($provider, $value);
            if (is_wp_error($mapped)) return $mapped;
            if ($mapped instanceof WP_User) return $this->updateExisting($mapped, $provider, $value, $request);

            $existing = get_user_by('email', $email);
            if ($existing instanceof WP_User) return $this->linkAndUpdate($existing, $provider, $value, $request);

            return new WP_Error('external_user_not_found', __('No user matches the provider identity or email.'), ['status' => 404]);
        });
    }

    public function delete(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $provider = (string) $request->get_param('provider');
        $value = urldecode((string) $request->get_param('value'));

        return $this->withIdentityLocks($provider, $value, null, function () use ($provider, $value) {
            $mapped = $this->getMappedUser($provider, $value);

            if (is_wp_error($mapped)) return $mapped;
            if (!$mapped instanceof WP_User) return new WP_REST_Response(['deleted' => false]);

            $protected = $this->protectedError($mapped, $provider, $value);
            if ($protected) return $protected;

            if (!function_exists('wp_delete_user')) {
                require_once ABSPATH . 'wp-admin/includes/user.php';
            }

            global $wpdb;
            $contentIds = $wpdb->get_col($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE post_author = %d", $mapped->ID));

            if (!wp_delete_user($mapped->ID)) {
                return new WP_Error('external_user_delete_failed', __('The mapped user could not be deleted.'), ['status' => 500]);
            }

            foreach ($contentIds as $contentId) {
                if (get_post((int) $contentId) && !wp_delete_post((int) $contentId, true)) {
                    return new WP_Error('external_user_delete_failed', __('The mapped user was deleted but some of its content could not be removed.'), ['status' => 500]);
                }
            }

            return new WP_REST_Response(['deleted' => true]);
        });
    }

    /** @return array<int, string> */
    private static function writeErrors(): array
    {
        return [
            'external_user_create_failed',
            'external_user_identity_conflict',
            'external_user_lock_unavailable',
            'external_user_protected',
            'external_user_update_failed',
        ];
    }

    /** @return array<int|string, array<string, mixed>> */
    private static function userResponses(bool $notFound = false): array
    {
        $responses = [
            '200' => ['description' => 'The linked WordPress user.', 'body' => ['$ref' => UserSchemas::USER]],
            '403' => ['description' => 'The matched account is protected.', 'body' => ['$ref' => \Kizlo\Modules\Introspection\CoreSchemas::ERROR]],
            '409' => ['description' => 'The provider identity or email conflicts with another account.', 'body' => ['$ref' => \Kizlo\Modules\Introspection\CoreSchemas::ERROR]],
            '500' => ['description' => 'WordPress could not save the account.', 'body' => ['$ref' => \Kizlo\Modules\Introspection\CoreSchemas::ERROR]],
            '503' => ['description' => 'The account lock could not be acquired.', 'body' => ['$ref' => \Kizlo\Modules\Introspection\CoreSchemas::ERROR]],
        ];

        if ($notFound) {
            $responses['404'] = ['description' => 'No account matches the provider identity or email.', 'body' => ['$ref' => \Kizlo\Modules\Introspection\CoreSchemas::ERROR]];
        }

        return $responses;
    }

    private function linkAndUpdate(WP_User $user, string $provider, string $value, WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $current = (string) get_user_meta($user->ID, self::mappingKey($provider), true);
        if ($current !== '' && $current !== $value) {
            return new WP_Error('external_user_identity_conflict', __('The matched account is linked to another provider identity.'), ['status' => 409]);
        }

        return $this->updateExisting($user, $provider, $value, $request);
    }

    private function updateExisting(WP_User $user, string $provider, string $value, WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $protected = $this->protectedError($user, $provider, $value);
        if ($protected) return $protected;

        $result = wp_update_user([
            'ID'         => $user->ID,
            'user_email' => (string) $request->get_param('email'),
            'first_name' => (string) $request->get_param('first_name'),
            'last_name'  => (string) $request->get_param('last_name'),
        ]);

        if (is_wp_error($result)) {
            $status = $result->get_error_code() === 'existing_user_email' ? 409 : 500;
            return new WP_Error('external_user_update_failed', $result->get_error_message(), ['status' => $status]);
        }

        $this->saveProviderData($user->ID, $provider, $value, $request);
        return $this->userResponse($user->ID);
    }

    private function saveProviderData(int $userId, string $provider, string $value, WP_REST_Request $request): void
    {
        update_user_meta($userId, self::mappingKey($provider), $value);
        update_user_meta($userId, self::profileKey($provider), $request->get_param('profile'));
    }

    private function getMappedUser(string $provider, string $value): WP_User|WP_Error|null
    {
        $users = get_users([
            'meta_key'    => self::mappingKey($provider),
            'meta_value'  => $value,
            'number'      => 2,
            'count_total' => false,
        ]);

        if (count($users) > 1) {
            return new WP_Error('external_user_identity_conflict', __('More than one account has this provider identity.'), ['status' => 409]);
        }

        return $users[0] ?? null;
    }

    private function protectedError(WP_User $user, string $provider, string $value): ?WP_Error
    {
        /**
         * Filters whether automatic external-user lifecycle operations protect an account.
         *
         * @param bool    $protected Whether the account is protected.
         * @param WP_User $user      The matched WordPress account.
         * @param string  $provider  External provider key.
         * @param string  $value     Stable provider user identifier.
         */
        $protected = (bool) apply_filters('kizlo_external_user_is_protected', $user->has_cap('edit_posts'), $user, $provider, $value);

        if (!$protected) return null;

        return new WP_Error('external_user_protected', __('The matched account is protected from automatic external-user changes.'), ['status' => 403]);
    }

    private function withIdentityLocks(string $provider, string $value, ?string $email, callable $operation): WP_REST_Response|WP_Error
    {
        global $wpdb;

        $locks = [
            'kizlo_ext_' . substr(hash('sha256', "provider\0{$provider}\0{$value}"), 0, 48),
        ];
        if ($email !== null) {
            $locks[] = 'kizlo_ext_' . substr(hash('sha256', 'email' . "\0" . strtolower($email)), 0, 48);
        }
        sort($locks, SORT_STRING);
        $acquired = [];

        foreach ($locks as $lock) {
            $result = $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, %d)', $lock, 10));
            if ((string) $result !== '1') {
                $this->releaseLocks($acquired);
                return new WP_Error('external_user_lock_unavailable', __('The external-user account lock could not be acquired.'), ['status' => 503]);
            }
            $acquired[] = $lock;
        }

        try {
            return $operation();
        } finally {
            $this->releaseLocks($acquired);
        }
    }

    /** @param array<int, string> $locks */
    private function releaseLocks(array $locks): void
    {
        global $wpdb;

        foreach (array_reverse($locks) as $lock) {
            $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock));
        }
    }

    private function availableLogin(string $email): string
    {
        $local = strstr($email, '@', true);
        $base = substr(sanitize_user($local === false ? '' : $local, true), 0, 40) ?: 'user';
        $suffix = substr(hash('sha256', strtolower($email)), 0, 10);
        $login = "{$base}-{$suffix}";
        $attempt = 1;

        while (username_exists($login)) {
            $login = "{$base}-{$suffix}-{$attempt}";
            $attempt++;
        }

        return substr($login, 0, 60);
    }

    private function userResponse(int $userId): WP_REST_Response|WP_Error
    {
        $controller = new WP_REST_Users_Controller();
        $request = new WP_REST_Request('GET');
        $request->set_param('id', $userId);
        $request->set_param('context', 'edit');

        return $controller->get_item($request);
    }

    private static function mappingKey(string $provider): string
    {
        return self::MAPPING_PREFIX . sanitize_key($provider);
    }

    private static function profileKey(string $provider): string
    {
        return self::PROFILE_PREFIX . sanitize_key($provider);
    }
}
