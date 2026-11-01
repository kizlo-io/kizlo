<?php

namespace Kizlo\Tests\Webhook;

use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\Modules\Settings\Webhook\WebhookSettings;
use Kizlo\Modules\Webhook\Webhook;
use Kizlo\Modules\Webhook\WebhookModule;
use Kizlo\Tests\TestCase;
use StandardWebhooks\Webhook as Signer;

class DeliveryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        foreach (['posts', 'terms', 'pending', 'public'] as $name) {
            $property = new \ReflectionProperty(\Kizlo\Modules\Post\ContentChanges::class, $name);
            $property->setValue(null, []);
        }
        $property = new \ReflectionProperty(WebhookModule::class, 'incomplete');
        $property->setValue(null, []);
        SiteSettings::load()->setSecret('delivery-secret')->setBackendUrl(null)->save();
        WebhookSettings::load()->setWebhookUrls(['https://receiver.example/webhooks'])->save();
    }

    private function jobs(): array
    {
        return get_posts(['post_type' => WebhookModule::TYPE, 'post_status' => ['pending', WebhookModule::RUNNING, 'publish', 'draft', 'trash'],
            'numberposts' => 100, 'orderby' => 'ID', 'order' => 'ASC', 'fields' => 'ids']);
    }

    private function payload(int $id): array
    {
        return json_decode(get_post($id)->post_content, true);
    }

    private function due(int $id): void
    {
        wp_clear_scheduled_hook(WebhookModule::DELIVER, [$id]);
        wp_update_post(['ID' => $id, 'post_date_gmt' => gmdate('Y-m-d H:i:s', time() - 1)]);
    }

    public function test_enqueue_is_durable_without_inline_http_and_storage_is_hidden(): void
    {
        $calls = 0;
        $filter = static function () use (&$calls) { $calls++; return []; };
        add_filter('pre_http_request', $filter);
        $data = ['id' => 1, 'html' => '<script>"quotes" & \\ slash</script>'];
        $this->assertTrue(Webhook::sendEvent('custom.event', $data));
        remove_filter('pre_http_request', $filter);
        $this->assertSame(0, $calls);
        $jobs = $this->jobs();
        $this->assertCount(1, $jobs);
        $job = $this->payload($jobs[0]);
        $this->assertSame(['type' => 'custom.event', 'data' => $data], json_decode($job['body'], true));
        $this->assertSame(0, $job['attempt']);
        $this->assertMatchesRegularExpression('/^msg_[a-f0-9]{32}$/', $job['message_id']);
        $this->assertStringNotContainsString('delivery-secret', json_encode($job));
        $this->assertNotFalse(wp_next_scheduled(WebhookModule::DELIVER, [$jobs[0]]));
        $type = get_post_type_object(WebhookModule::TYPE);
        $this->assertFalse($type->public);
        $this->assertFalse($type->show_ui);
        $this->assertFalse($type->show_in_rest);
        $this->assertFalse($type->can_export);
    }

    public function test_each_target_owns_an_independent_job(): void
    {
        WebhookSettings::load()->setWebhookUrls(['https://one.example/webhooks', 'https://two.example/webhooks'])->save();
        $this->assertTrue(Webhook::sendEvent('test', null));
        $jobs = array_map(fn($id) => $this->payload($id), $this->jobs());
        $this->assertCount(2, $jobs);
        $this->assertSame($jobs[0]['message_id'], $jobs[1]['message_id']);
        $this->assertNotSame($jobs[0]['target'], $jobs[1]['target']);
    }

    public function test_acknowledgement_signatures_timeout_and_retry_identity(): void
    {
        Webhook::sendEvent('test', ['affected_terms' => ['category' => [1, 2]]]);
        $id = $this->jobs()[0];
        $original = $this->payload($id);
        $calls = [];
        $filter = static function ($pre, $request) use (&$calls) {
            $calls[] = $request;
            return ['response' => ['code' => count($calls) === 1 ? 503 : 204], 'headers' => ['retry-after' => '7200'], 'body' => ''];
        };
        add_filter('pre_http_request', $filter, 10, 2);
        $module = new WebhookModule();
        $this->due($id);
        $module->deliver($id);
        $this->assertSame('pending', get_post_status($id));
        $this->assertSame(1, $this->payload($id)['attempt']);
        $this->assertGreaterThanOrEqual(time() + 7199, wp_next_scheduled(WebhookModule::DELIVER, [$id]));
        SiteSettings::load()->setSecret('rotated-secret')->save();
        $this->due($id);
        $module->deliver($id);
        remove_filter('pre_http_request', $filter);
        $this->assertSame('publish', get_post_status($id));
        $this->assertSame(2, $this->payload($id)['attempt']);
        $this->assertSame($original['body'], $this->payload($id)['body']);
        $this->assertSame($original['message_id'], $this->payload($id)['message_id']);
        $this->assertTrue($calls[0]['blocking']);
        $this->assertSame(10, $calls[0]['timeout']);
        $this->assertSame(0, $calls[0]['redirection']);
        $this->assertNotSame($calls[0]['headers']['webhook-signature'], $calls[1]['headers']['webhook-signature']);
        (new Signer(base64_encode('rotated-secret')))->verify($calls[1]['body'], $calls[1]['headers']);
        $this->assertCount(1, $this->jobs());
    }

    public function test_failures_stop_after_eight_attempts_without_duplicate_records(): void
    {
        Webhook::sendEvent('bounded', null);
        $id = $this->jobs()[0];
        $calls = 0;
        $filter = static function () use (&$calls) { $calls++; return new \WP_Error('test_timeout', 'Timeout'); };
        add_filter('pre_http_request', $filter);
        $module = new WebhookModule();
        for ($attempt = 1; $attempt <= 8; $attempt++) {
            $this->due($id);
            $module->deliver($id);
            $module->deliver($id);
            $this->assertSame($attempt, $this->payload($id)['attempt']);
        }
        remove_filter('pre_http_request', $filter);
        $this->assertSame(8, $calls);
        $this->assertSame('draft', get_post_status($id));
        $this->assertSame('test_timeout', get_post($id)->post_excerpt);
        $this->assertFalse(wp_next_scheduled(WebhookModule::DELIVER, [$id]));
        $this->assertCount(1, $this->jobs());
    }

    public function test_overlapping_runner_cannot_claim_the_same_attempt(): void
    {
        Webhook::sendEvent('concurrent', null);
        $id = $this->jobs()[0];
        $this->due($id);
        $module = new WebhookModule();
        $calls = 0;
        $filter = static function () use (&$calls, $module, $id) {
            $calls++;
            $module->deliver($id);
            return ['response' => ['code' => 200], 'headers' => [], 'body' => ''];
        };
        add_filter('pre_http_request', $filter);
        $module->deliver($id);
        remove_filter('pre_http_request', $filter);
        $this->assertSame(1, $calls);
        $this->assertSame('publish', get_post_status($id));
    }

    public function test_expired_lease_recovers_and_stale_worker_cannot_overwrite_new_acknowledgement(): void
    {
        Webhook::sendEvent('stale', null);
        $id = $this->jobs()[0];
        $this->due($id);
        $module = new WebhookModule();
        $calls = 0;
        $filter = function () use (&$calls, $module, $id) {
            $calls++;
            if ($calls === 1) {
                $this->assertSame(WebhookModule::RUNNING, get_post_status($id));
                $this->due($id);
                $module->sweep();
                $this->assertSame('pending', get_post_status($id));
                $this->assertGreaterThanOrEqual(time() + 59, wp_next_scheduled(WebhookModule::DELIVER, [$id]));
                $this->due($id);
                $module->deliver($id);
                return ['response' => ['code' => 503], 'headers' => [], 'body' => ''];
            }
            return ['response' => ['code' => 200], 'headers' => [], 'body' => ''];
        };
        add_filter('pre_http_request', $filter);
        $module->deliver($id);
        remove_filter('pre_http_request', $filter);
        $this->assertSame(2, $calls);
        $this->assertSame('publish', get_post_status($id));
        $this->assertSame(2, $this->payload($id)['attempt']);
        $this->assertFalse(wp_next_scheduled(WebhookModule::DELIVER, [$id]));
    }

    public function test_failed_acknowledgement_write_remains_recoverable(): void
    {
        Webhook::sendEvent('ack-write', null);
        $id = $this->jobs()[0];
        $this->due($id);
        global $wpdb;
        $previous = $wpdb->suppress_errors(true);
        $query = static fn($sql) => str_starts_with($sql, 'UPDATE') && str_contains($sql, "`post_status` = 'publish'") ? 'KIZLO_TEST_REJECT_ACKNOWLEDGEMENT_WRITE' : $sql;
        $http = static fn() => ['response' => ['code' => 200], 'headers' => [], 'body' => ''];
        add_filter('query', $query);
        add_filter('pre_http_request', $http);
        try { (new WebhookModule())->deliver($id); }
        finally {
            remove_filter('query', $query);
            remove_filter('pre_http_request', $http);
            $wpdb->suppress_errors($previous);
        }
        $this->assertSame(WebhookModule::RUNNING, get_post_status($id));
        $this->due($id);
        (new WebhookModule())->sweep();
        $this->assertSame('pending', get_post_status($id));
        $this->assertSame(1, $this->payload($id)['attempt']);
        $this->assertNotFalse(wp_next_scheduled(WebhookModule::DELIVER, [$id]));
    }

    public function test_internal_records_never_emit_content_even_when_explicitly_watched(): void
    {
        WebhookSettings::load()->setPostTypes(['post', 'page', WebhookModule::TYPE])->save();
        $post = self::factory()->post->create(['post_status' => 'publish']);
        \Kizlo\Modules\Post\ContentChanges::flush();
        $jobs = $this->jobs();
        $events = array_map(fn($id) => json_decode($this->payload($id)['body'], true), $jobs);
        $this->assertContains($post, array_column(array_column($events, 'data'), 'post_id'));
        foreach ($events as $event) $this->assertNotSame(WebhookModule::TYPE, $event['data']['post_type'] ?? null);
        $this->assertFalse(\Kizlo\Modules\Post\ContentChanges::watchedPost(get_post($jobs[0])));
    }

    public function test_retry_bounds_and_retry_after(): void
    {
        foreach ([60, 300, 900, 3600, 10800, 21600, 43200] as $index => $base) {
            $delay = WebhookModule::delay($index + 1);
            $this->assertGreaterThanOrEqual($base, $delay);
            $this->assertLessThanOrEqual((int) ($base * 1.2), $delay);
        }
        $this->assertSame(86400, WebhookModule::retryAfter('999999'));
        $this->assertSame(0, WebhookModule::retryAfter('invalid'));
        $this->assertSame(86400, WebhookModule::delay(1, 999999));
    }

    public function test_missing_configuration_and_removed_targets_do_not_send(): void
    {
        SiteSettings::load()->setSecret(null)->save();
        $this->assertFalse(Webhook::sendEvent('test'));
        SiteSettings::load()->setSecret('secret')->save();
        Webhook::sendEvent('test');
        $id = $this->jobs()[0];
        $this->due($id);
        WebhookSettings::load()->setWebhookUrls([])->save();
        (new WebhookModule())->deliver($id);
        $this->assertSame('trash', get_post_status($id));
        $this->assertSame(0, $this->payload($id)['attempt']);
    }

    public function test_partial_enqueue_failure_retries_only_the_missing_target(): void
    {
        WebhookSettings::load()->setWebhookUrls(['https://one.example/webhooks', 'https://two.example/webhooks'])->save();
        $filter = static fn($empty, $post) => $post['post_type'] === WebhookModule::TYPE && str_contains($post['post_title'], 'two.example') ? true : $empty;
        add_filter('wp_insert_post_empty_content', $filter, 10, 2);
        $this->assertFalse(Webhook::sendEvent('partial', ['id' => 12]));
        $this->assertCount(1, $this->jobs());
        remove_filter('wp_insert_post_empty_content', $filter);
        $this->assertTrue(Webhook::sendEvent('partial', ['id' => 12]));
        $this->assertCount(2, $this->jobs());
        $messages = array_map(fn($id) => $this->payload($id)['message_id'], $this->jobs());
        $this->assertCount(1, array_unique($messages));
    }

    public function test_failed_cron_insertion_remains_recoverable_without_duplicate_records(): void
    {
        $filter = static fn($pre, $event) => $event->hook === WebhookModule::DELIVER ? new \WP_Error('test', 'Failed scheduling') : $pre;
        add_filter('pre_schedule_event', $filter, 10, 2);
        $this->assertFalse(Webhook::sendEvent('recover', null));
        $id = $this->jobs()[0];
        $this->assertSame('pending', get_post_status($id));
        $this->assertFalse(wp_next_scheduled(WebhookModule::DELIVER, [$id]));
        remove_filter('pre_schedule_event', $filter);
        $this->assertTrue(Webhook::sendEvent('recover', null));
        $this->assertCount(1, $this->jobs());
        $this->due($id);
        (new WebhookModule())->sweep();
        $this->assertNotFalse(wp_next_scheduled(WebhookModule::DELIVER, [$id]));
    }

    public function test_deactivation_preserves_records_and_restores_only_kizlo_events(): void
    {
        Webhook::sendEvent('pause', null);
        wp_schedule_single_event(time() + 60, 'another_plugin_action');
        $id = $this->jobs()[0];
        $payload = $this->payload($id);
        $this->due($id);
        WebhookModule::deactivate();
        $this->assertFalse(wp_next_scheduled(WebhookModule::DELIVER, [$id]));
        $this->assertNotFalse(wp_next_scheduled('another_plugin_action'));
        $this->assertSame('pending', get_post_status($id));
        $module = new WebhookModule();
        $module->initialize();
        $this->assertNotFalse(wp_next_scheduled(WebhookModule::DELIVER, [$id]));
        $this->assertNotFalse(wp_next_scheduled(WebhookModule::RECOVER));
        $this->assertSame($payload, $this->payload($id));
        $module->initialize();
        $this->assertCount(1, $this->jobs());
    }

    public function test_retention_only_deletes_old_terminal_kizlo_records(): void
    {
        $old = gmdate('Y-m-d H:i:s', time() - 31 * DAY_IN_SECONDS);
        $ids = [];
        foreach (['draft', 'publish', 'trash', 'pending'] as $status) $ids[$status] = self::factory()->post->create(['post_type' => WebhookModule::TYPE, 'post_status' => $status, 'post_date_gmt' => $old, 'post_content' => '{"invalid":true}']);
        $other = self::factory()->post->create(['post_status' => 'draft', 'post_date_gmt' => $old]);
        (new WebhookModule())->sweep();
        foreach (['draft', 'publish', 'trash'] as $status) $this->assertNull(get_post($ids[$status]));
        $this->assertNotNull(get_post($other));
        $this->assertSame('draft', get_post_status($ids['pending']));
        $this->assertSame('Invalid delivery record', get_post($ids['pending'])->post_excerpt);
    }

    public function test_public_helper_before_initialization_reports_failure(): void
    {
        unregister_post_type(WebhookModule::TYPE);
        try { $this->assertFalse(Webhook::sendEvent('before-init')); }
        finally { (new WebhookModule())->initialize(); }
    }
}
