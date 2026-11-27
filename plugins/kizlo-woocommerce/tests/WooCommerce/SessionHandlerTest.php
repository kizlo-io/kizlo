<?php

namespace Kizlo\WooCommerce\Tests\WooCommerce;

use WP_Error;
use WP_REST_Request;
use WP_User;
use Kizlo\WooCommerce\Modules\WooCommerce\SessionHandler;
use Kizlo\WooCommerce\Tests\TestCase;

class SessionHandlerTest extends TestCase
{
    public function tearDown(): void
    {
        SessionHandler::clearPreparedIdentity();
        parent::tearDown();
    }

    public function test_creates_a_customer_on_an_email_that_matches_no_user(): void
    {
        $email = 'new-shopper@example.com';
        $this->assertFalse(get_user_by('email', $email));

        $identity = $this->resolve($email);
        $this->assertIsArray($identity);

        $userId = $identity['user_id'];
        $this->assertNotNull($userId);

        $user = get_user_by('email', $email);
        $this->assertInstanceOf(WP_User::class, $user);
        $this->assertSame($userId, (int) $user->ID);
        $this->assertContains('customer', $user->roles);
    }

    public function test_a_repeat_email_returns_the_same_user_and_creates_nothing(): void
    {
        $email = 'returning-shopper@example.com';

        $first  = $this->resolve($email)['user_id'];
        $second = $this->resolve($email)['user_id'];

        $this->assertNotNull($first);
        $this->assertSame($first, $second);
        $this->assertCount(1, $this->usersWithEmail($email));
    }

    public function test_repeated_requests_for_a_new_email_converge_on_one_user(): void
    {
        $email = 'converging-shopper@example.com';

        $ids = [];
        for ($i = 0; $i < 5; $i++) {
            $ids[] = $this->resolve($email)['user_id'];
        }

        $this->assertCount(1, array_unique($ids));
        $this->assertNotNull($ids[0]);
        $this->assertCount(1, $this->usersWithEmail($email));
    }

    public function test_reuses_an_existing_non_privileged_match(): void
    {
        $email      = 'subscriber@example.com';
        $existingId = self::factory()->user->create(['role' => 'subscriber', 'user_email' => $email]);

        $identity = $this->resolve($email);

        $this->assertSame($existingId, $identity['user_id']);
        $this->assertCount(1, $this->usersWithEmail($email));
    }

    public function test_refuses_a_privileged_match_with_an_error_and_creates_nothing(): void
    {
        $email = 'editor@example.com';
        self::factory()->user->create(['role' => 'administrator', 'user_email' => $email]);

        $identity = $this->resolve($email);

        $this->assertInstanceOf(WP_Error::class, $identity);
        $this->assertSame('kizlo_forbidden_identity', $identity->get_error_code());
        // The privileged account is left untouched; nothing new is created.
        $this->assertCount(1, $this->usersWithEmail($email));
    }

    public function test_a_request_without_an_email_header_resolves_no_user(): void
    {
        $identity = $this->resolve(null);

        $this->assertIsArray($identity);
        $this->assertNull($identity['user_id']);
        $this->assertNull($identity['guest_token']);
    }

    public function test_an_unresolved_guest_request_initializes_a_fresh_token(): void
    {
        SessionHandler::prepareIdentity(['user_id' => null, 'guest_token' => null]);

        $handler = new SessionHandler();
        $handler->init();
        remove_action('shutdown', [$handler, 'save_data'], 20);

        $this->assertNull($handler->get_resolved_user_id());
        $this->assertStringStartsWith(SessionHandler::PREFIX_GUEST, $handler->get_guest_token());
        $this->assertTrue(SessionHandler::isValidGuestToken($handler->get_guest_token()));
    }

    public function test_an_unverified_email_cannot_select_or_create_a_customer(): void
    {
        self::factory()->user->create(['role' => 'customer', 'user_email' => 'existing@example.com']);
        foreach (['existing@example.com', 'unverified-new@example.com'] as $email) {
            $request = new WP_REST_Request('GET', '/wc/store/v1/cart');
            $this->signRequest($request, $email, false);
            self::assertSame(['user_id' => null, 'guest_token' => null], SessionHandler::resolveIdentity($request, true));
        }
        self::assertFalse(get_user_by('email', 'unverified-new@example.com'));
    }

    public function test_forged_legacy_headers_cannot_select_a_customer_or_cart(): void
    {
        foreach ([SessionHandler::HEADER_USER_EMAIL => 'victim@example.com', SessionHandler::HEADER_GUEST_TOKEN => 't_0123456789abcdef0123456789abcd'] as $header => $value) {
            $request = new WP_REST_Request('GET', '/wc/store/v1/cart');
            $request->set_header($header, $value);
            self::assertInstanceOf(WP_Error::class, SessionHandler::resolveIdentity($request, true));
        }
        self::assertFalse(get_user_by('email', 'victim@example.com'));
    }

    public function test_a_native_signed_cart_token_is_required_and_customer_tokens_are_owner_bound(): void
    {
        $guest = 't_0123456789abcdef0123456789abcd';
        $request = new WP_REST_Request('GET', '/wc/store/v1/cart');
        $request->set_header('Cart-Token', \Automattic\WooCommerce\StoreApi\Utilities\CartTokenUtils::get_cart_token($guest));
        self::assertSame($guest, SessionHandler::resolveIdentity($request, true)['guest_token']);
        $request->set_header('Cart-Token', $guest);
        self::assertInstanceOf(WP_Error::class, SessionHandler::resolveIdentity($request, true));
        $owner = self::factory()->user->create(['role' => 'customer', 'user_email' => 'owner@example.com']);
        $request->set_header('Cart-Token', \Automattic\WooCommerce\StoreApi\Utilities\CartTokenUtils::get_cart_token((string) $owner));
        self::assertInstanceOf(WP_Error::class, SessionHandler::resolveIdentity($request, true));
        $this->signRequest($request, 'other@example.com');
        self::assertInstanceOf(WP_Error::class, SessionHandler::resolveIdentity($request, true));
        $this->signRequest($request, 'owner@example.com');
        self::assertSame($owner, SessionHandler::resolveIdentity($request, true)['user_id']);
    }

    /**
     * Resolve a request's identity through the request-scoped path.
     *
     * @return array{user_id: ?int, guest_token: ?string}|WP_Error
     */
    private function resolve(?string $email): array|WP_Error
    {
        $request = new WP_REST_Request('GET', '/wc/store/v1/cart');
        if ($email !== null) {
            $this->signRequest($request, $email);
        }

        return SessionHandler::resolveIdentity($request, true);
    }

    /** @return WP_User[] */
    private function usersWithEmail(string $email): array
    {
        return get_users(['search' => $email, 'search_columns' => ['user_email']]);
    }
}
