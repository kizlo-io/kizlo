<?php

namespace Kizlo\WooCommerce\Tests\WooCommerce;

use WP_User;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Tests\TestCase;

class SessionHandlerTest extends TestCase
{
    public function tearDown(): void
    {
        unset($_SERVER['HTTP_X_KIZLO_USER_EMAIL']);
        parent::tearDown();
    }

    public function test_creates_a_customer_on_an_email_that_matches_no_user(): void
    {
        $email = 'new-shopper@example.com';
        $this->assertFalse(get_user_by('email', $email));

        $handler = $this->resolve($email);

        $userId = $handler->get_resolved_user_id();
        $this->assertNotNull($userId);
        $this->assertSame((string) $userId, $handler->get_guest_token());

        $user = get_user_by('email', $email);
        $this->assertInstanceOf(WP_User::class, $user);
        $this->assertSame($userId, (int) $user->ID);
        $this->assertContains('customer', $user->roles);
    }

    public function test_a_repeat_email_returns_the_same_user_and_creates_nothing(): void
    {
        $email = 'returning-shopper@example.com';

        $first  = $this->resolve($email)->get_resolved_user_id();
        $second = $this->resolve($email)->get_resolved_user_id();

        $this->assertNotNull($first);
        $this->assertSame($first, $second);
        $this->assertCount(1, $this->usersWithEmail($email));
    }

    public function test_concurrent_requests_for_a_new_email_converge_on_one_user(): void
    {
        $email = 'converging-shopper@example.com';

        $ids = [];
        for ($i = 0; $i < 5; $i++) {
            $ids[] = $this->resolve($email)->get_resolved_user_id();
        }

        $this->assertCount(1, array_unique($ids));
        $this->assertNotNull($ids[0]);
        $this->assertCount(1, $this->usersWithEmail($email));
    }

    public function test_reuses_an_existing_non_privileged_match(): void
    {
        $email      = 'subscriber@example.com';
        $existingId = self::factory()->user->create(['role' => 'subscriber', 'user_email' => $email]);

        $handler = $this->resolve($email);

        $this->assertSame($existingId, $handler->get_resolved_user_id());
        $this->assertCount(1, $this->usersWithEmail($email));
    }

    public function test_refuses_a_privileged_match_and_falls_back_to_guest(): void
    {
        $email = 'editor@example.com';
        self::factory()->user->create(['role' => 'administrator', 'user_email' => $email]);

        $handler = $this->resolve($email);

        $this->assertNull($handler->get_resolved_user_id());
        $this->assertStringStartsWith(SessionHandler::PREFIX_GUEST, $handler->get_guest_token());
        // The privileged account is left untouched; nothing new is created.
        $this->assertCount(1, $this->usersWithEmail($email));
    }

    public function test_a_request_without_an_email_header_is_an_unchanged_guest(): void
    {
        $handler = $this->resolve(null);

        $this->assertNull($handler->get_resolved_user_id());
        $this->assertStringStartsWith(SessionHandler::PREFIX_GUEST, $handler->get_guest_token());
    }

    /** Drive the header path and return an initialized handler without its shutdown save. */
    private function resolve(?string $email): SessionHandler
    {
        if ($email === null) {
            unset($_SERVER['HTTP_X_KIZLO_USER_EMAIL']);
        } else {
            $_SERVER['HTTP_X_KIZLO_USER_EMAIL'] = $email;
        }

        $handler = new SessionHandler();
        $handler->init();
        remove_action('shutdown', [$handler, 'save_data'], 20);

        return $handler;
    }

    /** @return WP_User[] */
    private function usersWithEmail(string $email): array
    {
        return get_users(['search' => $email, 'search_columns' => ['user_email']]);
    }
}
