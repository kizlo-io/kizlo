<?php

namespace Kizlo\Tests\Integrations;

use Kizlo\Modules\Integrations\WhatsAppSettings;
use Kizlo\Modules\Settings\SettingsModule;
use Kizlo\Tests\TestCase;
use WP_REST_Request;

class WhatsAppTest extends TestCase
{
    private const TOKEN = 'test-private-meta-token';
    private array $requests = [];
    private int $code = 200;
    private bool $transportError = false;
    private array $reply = ['messages' => [['id' => 'wamid.test']]];

    protected function setUp(): void
    {
        parent::setUp();
        delete_option(WhatsAppSettings::OPTION);
        add_filter('pre_http_request', [$this, 'http'], 10, 3);
    }

    public function http($pre, $args, $url): array|\WP_Error
    {
        $this->requests[] = ['url' => $url, 'args' => $args];
        if ($this->transportError) return new \WP_Error('http_request_failed', 'Timed out');
        return ['headers' => [], 'body' => wp_json_encode($this->reply), 'response' => ['code' => $this->code, 'message' => 'Test'], 'cookies' => []];
    }

    protected function tearDown(): void
    {
        remove_filter('pre_http_request', [$this, 'http'], 10);
        parent::tearDown();
    }

    private function configure(): void
    {
        $result = WhatsAppSettings::save(['phone_number_id' => '123456789', 'api_token' => self::TOKEN]);
        $this->assertIsArray($result);
    }

    private function request(string $method, string $path, array $body = []): \WP_REST_Response
    {
        $request = new WP_REST_Request($method, '/kizlo/v1' . $path);
        if ($method !== 'GET') {
            $request->set_header('Content-Type', 'application/json');
            $request->set_body(wp_json_encode($body));
        }
        return rest_do_request($request);
    }

    public function test_shared_accessor_does_not_send_or_capture_stale_site_settings(): void
    {
        $client = kizlo_get_integrations()->whatsapp;
        $this->assertSame(kizlo_get_integrations(), kizlo_get_integrations());
        $this->assertFalse($client->isConfigured());
        $this->assertSame([], $this->requests);
        $this->configure();
        $this->assertTrue($client->isConfigured());
        $this->assertSame([], $this->requests);
    }

    public function test_settings_encrypt_preserve_replace_and_remove_the_token_without_exposing_it(): void
    {
        $this->actingAsCookieAdmin();
        $saved = $this->request('PUT', '/settings/integrations/whatsapp', ['phone_number_id' => '123456789', 'api_token' => self::TOKEN]);
        $this->assertSame(200, $saved->get_status());
        $this->assertTrue($saved->get_data()['configured']);
        $this->assertStringNotContainsString(self::TOKEN, wp_json_encode(get_option(WhatsAppSettings::OPTION)));
        $this->assertStringNotContainsString(self::TOKEN, wp_json_encode($saved->get_data()));
        $this->assertSame(self::TOKEN, WhatsAppSettings::token());
        $empty = rest_do_request(new WP_REST_Request('PUT', '/kizlo/v1/settings/integrations/whatsapp'));
        $this->assertSame(200, $empty->get_status());
        $this->assertSame(self::TOKEN, WhatsAppSettings::token());
        $this->assertStringContainsString('no-store', $saved->get_headers()['Cache-Control']);
        $this->request('PUT', '/settings/integrations/whatsapp', ['phone_number_id' => '987654321', 'api_token' => '']);
        $this->assertSame(self::TOKEN, WhatsAppSettings::token());
        $this->assertSame('987654321', WhatsAppSettings::status()['phone_number_id']);
        $read = $this->request('GET', '/settings/integrations/whatsapp');
        $this->assertArrayNotHasKey('api_token', $read->get_data());
        $this->assertArrayNotHasKey('token', $read->get_data());
        $this->assertStringNotContainsString(self::TOKEN, wp_json_encode((new SettingsModule())->getPluginData()));
        $this->request('PUT', '/settings/integrations/whatsapp', ['api_token' => 'replacement-token']);
        $this->assertSame('replacement-token', WhatsAppSettings::token());
        $this->request('PUT', '/settings/integrations/whatsapp', ['clear_token' => true]);
        $this->assertFalse(WhatsAppSettings::status()['configured']);
        $this->assertWPError(WhatsAppSettings::token());
    }

    public function test_settings_and_send_routes_require_administrator_access(): void
    {
        foreach ([0, self::factory()->user->create(['role' => 'subscriber'])] as $user) {
            wp_set_current_user($user);
            foreach ([['GET', '/settings/integrations/whatsapp'], ['PUT', '/settings/integrations/whatsapp'], ['POST', '/settings/integrations/whatsapp/test'], ['POST', '/whatsapp/send']] as [$method, $path]) {
                $result = $this->request($method, $path, ['to' => '+919876543210', 'type' => 'text', 'text' => 'Test']);
                $this->assertContains($result->get_status(), [401, 403]);
            }
        }
        $this->assertSame([], $this->requests);
    }

    public function test_invalid_settings_and_messages_never_reach_meta(): void
    {
        $this->configure();
        foreach ([['phone_number_id' => '+919876543210'], ['api_token' => "secret\r\nheader"], ['api_token' => 'new', 'clear_token' => true], ['unknown' => 'value']] as $bad) $this->assertWPError(WhatsAppSettings::save($bad));
        $client = kizlo_get_integrations()->whatsapp;
        $this->assertWPError($client->sendText('123', 'Hello'));
        $this->assertWPError($client->sendText('+919876543210', ''));
        $this->assertWPError($client->sendText('+919876543210', str_repeat('x', 4097)));
        $this->assertWPError($client->sendDocument('+919876543210', 'file:///private/invoice.pdf'));
        $this->assertWPError($client->sendTemplate('+919876543210', 'Invalid Template'));
        $this->assertSame([], $this->requests);
    }

    public function test_send_methods_and_test_template_use_the_shared_server_credentials(): void
    {
        $this->actingAsCookieAdmin();
        $this->configure();
        $client = kizlo_get_integrations()->whatsapp;
        $result = $client->sendText('+91 (98765) 43210', 'Pay here: https://example.org/pay');
        $this->assertSame(['status' => 'accepted', 'provider_id' => 'wamid.test'], $result);
        $request = $this->requests[0];
        $this->assertSame('https://graph.facebook.com/v27.0/123456789/messages', $request['url']);
        $this->assertSame('Bearer ' . self::TOKEN, $request['args']['headers']['Authorization']);
        $this->assertSame(0, $request['args']['redirection']);
        $body = json_decode($request['args']['body'], true);
        $this->assertSame('919876543210', $body['to']);
        $this->assertSame('Pay here: https://example.org/pay', $body['text']['body']);
        $client->sendDocument('+919876543210', 'https://example.org/invoice.pdf', 'invoice.pdf');
        $this->assertSame('https://example.org/invoice.pdf', json_decode($this->requests[1]['args']['body'], true)['document']['link']);
        $client->sendDocument('+919876543210', '987654321');
        $this->assertSame('987654321', json_decode($this->requests[2]['args']['body'], true)['document']['id']);
        $test = $this->request('POST', '/settings/integrations/whatsapp/test', ['to' => '+919876543210']);
        $this->assertSame(200, $test->get_status());
        $this->assertSame('hello_world', json_decode($this->requests[3]['args']['body'], true)['template']['name']);
        $sent = $this->request('POST', '/whatsapp/send', ['to' => '+919876543210', 'type' => 'text', 'text' => 'API message']);
        $this->assertSame(200, $sent->get_status());
    }

    public function test_provider_errors_do_not_echo_credentials_and_uncertain_results_are_not_retried(): void
    {
        $this->configure();
        $this->code = 401;
        $this->reply = ['error' => ['message' => 'Invalid token: ' . self::TOKEN]];
        $result = kizlo_get_integrations()->whatsapp->sendText('+919876543210', 'Hello');
        $this->assertWPError($result);
        $this->assertStringNotContainsString(self::TOKEN, $result->get_error_message());
        $this->assertSame('failed', $result->get_error_data()['delivery_status']);
        $this->code = 503;
        $result = kizlo_get_integrations()->whatsapp->sendText('+919876543210', 'Hello');
        $this->assertSame('unknown', $result->get_error_data()['delivery_status']);
        $this->assertCount(2, $this->requests);
        $this->code = 200;
        $this->reply = [];
        $result = kizlo_get_integrations()->whatsapp->sendText('+919876543210', 'Hello');
        $this->assertSame('unknown', $result->get_error_data()['delivery_status']);
        $this->transportError = true;
        $result = kizlo_get_integrations()->whatsapp->sendText('+919876543210', 'Hello');
        $this->assertSame('unknown', $result->get_error_data()['delivery_status']);
        $this->assertCount(4, $this->requests);
        $saved = get_option(WhatsAppSettings::OPTION);
        $saved['token'] = base64_encode(str_repeat('bad', 20));
        update_option(WhatsAppSettings::OPTION, $saved);
        $this->assertWPError(WhatsAppSettings::token());
    }
}
