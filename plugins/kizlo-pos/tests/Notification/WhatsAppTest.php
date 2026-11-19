<?php

namespace Kizlo\Pos\Tests\Notification;

use Kizlo\Modules\Integrations\WhatsAppSettings;
use Kizlo\Pos\Modules\Checkout\PaymentPage;
use Kizlo\Pos\Modules\Notification\Notifications;
use Kizlo\Pos\Modules\Notification\WhatsApp;

final class WhatsAppTest extends \WP_UnitTestCase
{
    private array $messages = [];

    protected function setUp(): void
    {
        parent::setUp();
        delete_option('kizlo_pos_whatsapp');
        delete_option(WhatsAppSettings::OPTION);
        add_filter('pre_http_request', [$this, 'http'], 10, 3);
    }

    public function http($pre, $args, $url): array
    {
        $this->messages[] = json_decode($args['body'], true);
        return ['headers' => [], 'body' => '{"messages":[{"id":"wamid.payment"}]}', 'response' => ['code' => 200, 'message' => 'OK'], 'cookies' => []];
    }

    protected function tearDown(): void
    {
        remove_filter('pre_http_request', [$this, 'http'], 10);
        parent::tearDown();
    }

    public function test_channel_requires_explicit_pos_enablement_connection_and_customer_phone(): void
    {
        $order = new \WC_Order();
        $order->set_created_via('kizlo-pos');
        $order->save();
        $channel = new WhatsApp();
        $this->assertArrayNotHasKey('whatsapp', Notifications::channels());
        $this->assertNotNull($channel->unavailable($order, 'pos_payment_request'));
        update_option('kizlo_pos_whatsapp', 'yes');
        $this->assertArrayHasKey('whatsapp', Notifications::channels());
        $this->assertNotNull($channel->unavailable($order, 'pos_payment_request'));
        WhatsAppSettings::save(['phone_number_id' => '123456789', 'api_token' => 'private-test-token']);
        $this->assertNotNull($channel->unavailable($order, 'pos_payment_request'));
        $order->set_billing_phone('+919876543210');
        $this->assertNull($channel->unavailable($order, 'pos_payment_request'));
        $this->assertSame([], $this->messages);
    }

    public function test_explicit_payment_request_uses_the_scoped_link_and_is_not_sent_twice(): void
    {
        update_option('kizlo_pos_whatsapp', 'yes');
        WhatsAppSettings::save(['phone_number_id' => '123456789', 'api_token' => 'private-test-token']);
        $order = new \WC_Order();
        $order->set_created_via('kizlo-pos');
        $order->set_status('pending');
        $order->set_total('10');
        $order->set_billing_phone('+919876543210');
        $order->save();
        $url = PaymentPage::url($order);
        $delivery = Notifications::request($order, 'whatsapp', wp_generate_uuid4());
        $this->assertSame([], $this->messages);
        Notifications::deliver($order->get_id(), $delivery['id']);
        $this->assertCount(1, $this->messages);
        $this->assertSame('919876543210', $this->messages[0]['to']);
        $this->assertStringContainsString($url, $this->messages[0]['text']['body']);
        $this->assertSame('accepted', get_option('kizlo_pos_delivery_' . $delivery['id'])['status']);
        Notifications::deliver($order->get_id(), $delivery['id']);
        $this->assertCount(1, $this->messages);
        $this->assertSame(['pos_payment_request'], (new WhatsApp())->events());
    }
}
