<?php

namespace Kizlo\Tests\Captcha;

use Kizlo\Modules\Captcha\Captcha;
use Kizlo\Modules\Settings\Captcha\CaptchaSettings;
use Kizlo\Tests\TestCase;
use WP_Error;

final class CaptchaTest extends TestCase
{
    public function test_missing_token_and_missing_configuration_fail_closed(): void
    {
        self::assertSame('kizlo_captcha_required', Captcha::verify(null)->get_error_code());
        self::assertSame('kizlo_captcha_unavailable', Captcha::verify('token')->get_error_code());
    }

    /** @dataProvider providers */
    public function test_supported_remote_providers_verify_only_on_success(string $provider, array $payload): void
    {
        (new CaptchaSettings())->setData(['provider' => $provider, 'secret' => 'private-provider-key'])->save();
        $success = static fn() => ['response' => ['code' => 200], 'body' => json_encode($payload)];
        add_filter('pre_http_request', $success);
        self::assertTrue(Captcha::verify('browser-proof'));
        remove_filter('pre_http_request', $success);
        add_filter('pre_http_request', static fn() => ['response' => ['code' => 200], 'body' => '{"success":false}']);
        self::assertSame('kizlo_captcha_invalid', Captcha::verify('browser-proof')->get_error_code());
    }

    public function providers(): array
    {
        return [
            ['turnstile', ['success' => true]], ['recaptcha', ['success' => true, 'score' => 0.9]],
            ['hcaptcha', ['success' => true]], ['friendly', ['success' => true]], ['arkose', ['session_details' => ['solved' => true]]],
        ];
    }

    public function test_network_failure_is_not_a_success_and_low_scores_are_rejected(): void
    {
        (new CaptchaSettings())->setData(['provider' => 'recaptcha', 'secret' => 'private-provider-key'])->save();
        $offline = static fn() => new WP_Error('http_request_failed', 'Offline');
        add_filter('pre_http_request', $offline);
        self::assertSame('kizlo_captcha_unavailable', Captcha::verify('proof')->get_error_code());
        remove_filter('pre_http_request', $offline);
        add_filter('pre_http_request', static fn() => ['response' => ['code' => 200], 'body' => '{"success":true,"score":0.1}']);
        self::assertSame('kizlo_captcha_invalid', Captcha::verify('proof')->get_error_code());
    }

    public function test_wordpress_issues_expiring_single_use_altcha_challenges_without_an_app_server(): void
    {
        (new CaptchaSettings())->setData(['provider' => 'altcha', 'secret' => 'test-secret'])->save();
        $response = (new \Kizlo\Modules\Captcha\Challenge())->retrieve();
        self::assertSame('private, no-store', $response->get_headers()['Cache-Control']);
        $challenge = $response->get_data();
        for ($number = 0; $number <= $challenge['maxnumber']; $number++) {
            if (hash('sha256', $challenge['salt'] . $number) === $challenge['challenge']) break;
        }
        self::assertLessThanOrEqual($challenge['maxnumber'], $number);
        $token = base64_encode(json_encode($challenge + ['number' => $number]));
        self::assertTrue(Captcha::verify($token));
        self::assertSame('kizlo_captcha_invalid', Captcha::verify($token)->get_error_code());
    }

    public function test_altcha_verifies_signature_expiry_and_rejects_replay(): void
    {
        (new CaptchaSettings())->setData(['provider' => 'altcha', 'secret' => 'private-hmac-key'])->save();
        $salt = 'random-salt?expires=' . (time() + 300);
        $challenge = hash('sha256', $salt . '1');
        $token = base64_encode(json_encode(['algorithm' => 'SHA-256', 'salt' => $salt, 'number' => 1,
            'challenge' => $challenge, 'signature' => hash_hmac('sha256', $challenge, 'private-hmac-key')]));
        self::assertTrue(Captcha::verify($token));
        self::assertSame('kizlo_captcha_invalid', Captcha::verify($token)->get_error_code());
        self::assertSame('kizlo_captcha_invalid', Captcha::verify(base64_encode('{"algorithm":"SHA-256"}'))->get_error_code());
    }
}
