<?php

namespace Kizlo\Tests\User;

use Kizlo\Modules\User\ExternalUserApi;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_UnitTestCase;

class ExternalUserApiTest extends WP_UnitTestCase
{
    private ExternalUserApi $api;

    protected function setUp(): void
    {
        parent::setUp();
        $this->api = new ExternalUserApi();
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));
    }

    public function test_create_is_idempotent_and_persists_the_provider_profile(): void
    {
        $first = $this->api->create($this->writeRequest());
        $second = $this->api->create($this->writeRequest(['first_name' => 'Updated']));

        $this->assertInstanceOf(WP_REST_Response::class, $first);
        $this->assertInstanceOf(WP_REST_Response::class, $second);
        $this->assertSame($first->get_data()['id'], $second->get_data()['id']);

        $users = get_users(['search' => 'clerk@example.com', 'search_columns' => ['user_email']]);
        $this->assertCount(1, $users);
        $this->assertSame('user_clerk_1', get_user_meta($users[0]->ID, '_kizlo_external_id_clerk', true));
        $this->assertSame($this->profile(), get_user_meta($users[0]->ID, '_kizlo_external_profile_clerk', true));
        $this->assertSame('Updated', get_userdata($users[0]->ID)->first_name);
        $this->assertSame('subscriber', $users[0]->roles[0]);
    }

    public function test_create_uses_subscriber_when_the_site_default_is_privileged(): void
    {
        $defaultRole = get_option('default_role');
        update_option('default_role', 'administrator');

        try {
            $response = $this->api->create($this->writeRequest());
        } finally {
            update_option('default_role', $defaultRole);
        }

        $this->assertInstanceOf(WP_REST_Response::class, $response);
        $user = get_userdata($response->get_data()['id']);
        $this->assertSame(['subscriber'], $user->roles);
    }

    public function test_create_links_an_existing_non_privileged_email(): void
    {
        add_role('external_member', 'External Member', ['read' => true]);

        try {
            $userId = self::factory()->user->create(['role' => 'external_member', 'user_email' => 'clerk@example.com']);
            $response = $this->api->create($this->writeRequest());
            $roles = get_userdata($userId)->roles;
        } finally {
            remove_role('external_member');
        }

        $this->assertInstanceOf(WP_REST_Response::class, $response);
        $this->assertSame($userId, $response->get_data()['id']);
        $this->assertSame('user_clerk_1', get_user_meta($userId, '_kizlo_external_id_clerk', true));
        $this->assertSame(['external_member'], $roles);
    }

    public function test_duplicate_insert_recovery_converges_on_the_competing_account(): void
    {
        $inserting = false;
        $competitorId = 0;
        $filter = function (string $login) use (&$inserting, &$competitorId): string {
            if ($inserting) return $login;

            $inserting = true;
            $competitorId = wp_insert_user([
                'user_login' => $login,
                'user_email' => 'clerk@example.com',
                'user_pass'  => wp_generate_password(),
                'role'       => 'subscriber',
            ]);
            return $login;
        };
        add_filter('pre_user_login', $filter);

        try {
            $response = $this->api->create($this->writeRequest());
        } finally {
            remove_filter('pre_user_login', $filter);
        }

        $this->assertIsInt($competitorId);
        $this->assertInstanceOf(WP_REST_Response::class, $response);
        $this->assertSame($competitorId, $response->get_data()['id']);
        $this->assertSame('user_clerk_1', get_user_meta($competitorId, '_kizlo_external_id_clerk', true));
        $this->assertCount(1, get_users(['search' => 'clerk@example.com', 'search_columns' => ['user_email']]));
    }

    public function test_update_uses_the_stable_mapping_after_an_email_change(): void
    {
        $created = $this->api->create($this->writeRequest());
        $userId = $created->get_data()['id'];

        $updated = $this->api->update($this->writeRequest([
            'email'      => 'changed@example.com',
            'first_name' => 'Ada',
            'last_name'  => 'Lovelace',
            'profile'    => ['username' => 'ada', 'publicMetadata' => ['plan' => 'team']],
        ]));

        $this->assertInstanceOf(WP_REST_Response::class, $updated);
        $this->assertSame($userId, $updated->get_data()['id']);
        $user = get_userdata($userId);
        $this->assertSame('changed@example.com', $user->user_email);
        $this->assertSame('Ada', $user->first_name);
        $this->assertSame('Lovelace', $user->last_name);
        $this->assertSame(
            ['username' => 'ada', 'publicMetadata' => ['plan' => 'team']],
            get_user_meta($userId, '_kizlo_external_profile_clerk', true)
        );
    }

    public function test_update_links_an_email_match_but_does_not_create_a_missing_user(): void
    {
        $userId = self::factory()->user->create(['role' => 'subscriber', 'user_email' => 'clerk@example.com']);

        $linked = $this->api->update($this->writeRequest());
        $missing = $this->api->update($this->writeRequest(['email' => 'missing@example.com'], 'user_missing'));

        $this->assertInstanceOf(WP_REST_Response::class, $linked);
        $this->assertSame($userId, $linked->get_data()['id']);
        $this->assertInstanceOf(WP_Error::class, $missing);
        $this->assertSame('external_user_not_found', $missing->get_error_code());
        $this->assertFalse(get_user_by('email', 'missing@example.com'));
    }

    public function test_delete_removes_the_mapped_account_and_content_and_retries_succeed(): void
    {
        $created = $this->api->create($this->writeRequest());
        $userId = $created->get_data()['id'];
        $postId = self::factory()->post->create(['post_author' => $userId]);

        $deleted = $this->api->delete($this->identityRequest());
        $retried = $this->api->delete($this->identityRequest());

        $this->assertSame(['deleted' => true], $deleted->get_data());
        $this->assertFalse(get_userdata($userId));
        $this->assertNull(get_post($postId));
        $this->assertSame(['deleted' => false], $retried->get_data());
    }

    public function test_privileged_email_matches_are_not_linked(): void
    {
        $userId = self::factory()->user->create(['role' => 'editor', 'user_email' => 'clerk@example.com']);

        $result = $this->api->create($this->writeRequest());

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame('external_user_protected', $result->get_error_code());
        $this->assertSame('', get_user_meta($userId, '_kizlo_external_id_clerk', true));
        $this->assertSame('', get_user_meta($userId, '_kizlo_external_profile_clerk', true));
    }

    public function test_privileged_mapped_accounts_are_not_updated_or_deleted(): void
    {
        $userId = self::factory()->user->create([
            'role'       => 'editor',
            'user_email' => 'clerk@example.com',
            'first_name' => 'Original',
        ]);
        update_user_meta($userId, '_kizlo_external_id_clerk', 'user_clerk_1');

        $updated = $this->api->update($this->writeRequest(['first_name' => 'Changed']));
        $deleted = $this->api->delete($this->identityRequest());

        $this->assertInstanceOf(WP_Error::class, $updated);
        $this->assertSame('external_user_protected', $updated->get_error_code());
        $this->assertSame('Original', get_userdata($userId)->first_name);
        $this->assertInstanceOf(WP_Error::class, $deleted);
        $this->assertSame('external_user_protected', $deleted->get_error_code());
        $this->assertInstanceOf(\WP_User::class, get_userdata($userId));
    }

    public function test_the_protection_filter_can_allow_a_privileged_account(): void
    {
        $userId = self::factory()->user->create(['role' => 'editor', 'user_email' => 'clerk@example.com']);
        $filter = static fn(): bool => false;
        add_filter('kizlo_external_user_is_protected', $filter);

        try {
            $result = $this->api->create($this->writeRequest());
        } finally {
            remove_filter('kizlo_external_user_is_protected', $filter);
        }

        $this->assertInstanceOf(WP_REST_Response::class, $result);
        $this->assertSame($userId, $result->get_data()['id']);
    }

    private function writeRequest(array $overrides = [], string $value = 'user_clerk_1'): WP_REST_Request
    {
        $request = $this->identityRequest($value);
        $body = array_merge([
            'email'      => 'clerk@example.com',
            'first_name' => 'Grace',
            'last_name'  => 'Hopper',
            'profile'    => $this->profile(),
        ], $overrides);

        foreach ($body as $key => $item) {
            $request->set_param($key, $item);
        }

        return $request;
    }

    private function identityRequest(string $value = 'user_clerk_1'): WP_REST_Request
    {
        $request = new WP_REST_Request();
        $request->set_param('provider', 'clerk');
        $request->set_param('value', $value);
        return $request;
    }

    private function profile(): array
    {
        return [
            'username'       => 'grace',
            'imageUrl'       => 'https://example.com/grace.jpg',
            'publicMetadata' => ['plan' => 'pro'],
        ];
    }
}
