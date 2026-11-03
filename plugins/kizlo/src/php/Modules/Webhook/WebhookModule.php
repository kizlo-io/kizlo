<?php

namespace Kizlo\Modules\Webhook;

use Kizlo\Modules\Post\ContentChanges;
use Kizlo\Support\Utils;
use RuntimeException;
use StandardWebhooks\Webhook as StandardWebhook;
use Throwable;
use WP_Post;

final class WebhookModule
{
    public const TYPE = 'kizlo_webhook';
    public const RUNNING = 'kizlo_running';
    public const DELIVER = 'kizlo_webhook_deliver';
    public const RECOVER = 'kizlo_webhook_recover';
    private const DELAYS = [60, 300, 900, 3600, 10800, 21600, 43200];
    private static array $incomplete = [];
    private static bool $configurationReported = false;

    public function register(): void
    {
        add_filter('cron_schedules', static function ($schedules) {
            $schedules['kizlo_minute'] = ['interval' => 60, 'display' => 'Kizlo webhook recovery'];
            return $schedules;
        });
        add_action('init', [$this, 'initialize'], 0);
        add_action(self::DELIVER, [$this, 'deliver']);
        add_action(self::RECOVER, [$this, 'sweep']);
        add_action('shutdown', [ContentChanges::class, 'flush'], PHP_INT_MAX);
        add_filter('rest_post_dispatch', static function ($response) { ContentChanges::flush(); return $response; }, PHP_INT_MAX);
        if (defined('WP_CLI') && WP_CLI) {
            \WP_CLI::add_command('kizlo webhooks list', [$this, 'listing']);
            \WP_CLI::add_command('kizlo webhooks retry', [$this, 'replay']);
        }
    }

    public function initialize(): void
    {
        register_post_type(self::TYPE, ['public' => false, 'show_ui' => false, 'show_in_rest' => false,
            'rewrite' => false, 'query_var' => false, 'can_export' => false, 'supports' => []]);
        register_post_status(self::RUNNING, ['internal' => true, 'public' => false]);
        if (wp_next_scheduled(self::RECOVER) === false) {
            if (wp_schedule_event(time() + 60, 'kizlo_minute', self::RECOVER, [], true) !== true) self::log(0, 'Could not schedule recovery; check WordPress cron storage.');
            $this->sweep();
        }
    }

    public static function targets(): array
    {
        $settings = Utils::getSettings();
        $urls = $settings->webhook->getWebhookUrls();
        $backend = $settings->site->getBackendUrl();
        if ($backend) array_unshift($urls, rtrim($backend, '/') . Webhook::WEBHOOK_PATH);
        return array_values(array_unique(array_filter($urls)));
    }

    public static function enqueue(string $type, ?array $data): bool
    {
        if (!post_type_exists(self::TYPE)) {
            self::log(0, 'Enqueue failed: emit after init priority 0.');
            return false;
        }
        $targets = self::targets();
        if (!$targets || !Utils::getSettings()->site->getSecret()) {
            if (!self::$configurationReported) self::log(0, 'Enqueue failed: configure a webhook target and site secret.');
            self::$configurationReported = true;
            return false;
        }
        $body = wp_json_encode(['type' => $type, 'data' => $data]);
        if ($body === false) { self::log(0, 'Enqueue failed: event is not JSON serializable.'); return false; }
        $key = hash('sha256', $body);
        try {
            $state = self::$incomplete[$key] ?? ['message_id' => 'msg_' . bin2hex(random_bytes(16)), 'created_at' => time(), 'jobs' => []];
        } catch (Throwable $error) {
            self::log(0, 'Enqueue failed: could not generate a secure message identity.');
            return false;
        }
        $success = true;
        foreach ($targets as $target) {
            try {
                if (!isset($state['jobs'][$target])) {
                    $job = ['message_id' => $state['message_id'], 'target' => $target, 'body' => $body, 'created_at' => $state['created_at'], 'attempt' => 0];
                    $id = wp_insert_post(wp_slash(['post_type' => self::TYPE, 'post_status' => 'pending', 'post_author' => 0,
                        'post_title' => 'Webhook: ' . self::safeTarget($target), 'post_content' => self::encode($job),
                        'post_date_gmt' => gmdate('Y-m-d H:i:s')]), true);
                    if (is_wp_error($id)) throw new RuntimeException('Storage rejected delivery');
                    $state['jobs'][$target] = $id;
                }
                if (!self::schedule($state['jobs'][$target], time() + 1)) $success = false;
            } catch (Throwable $error) {
                self::log(0, 'Enqueue failed for ' . self::safeTarget($target) . '; check WordPress storage.');
                $success = false;
            }
        }
        if ($success) unset(self::$incomplete[$key]);
        else self::$incomplete[$key] = $state;
        return $success;
    }

    public function deliver(int $id): void
    {
        $post = get_post($id);
        if (!$post || $post->post_type !== self::TYPE || $post->post_status !== 'pending' || strtotime($post->post_date_gmt . ' UTC') > time()) return;
        $job = self::data($post);
        if (!$job) { self::update($post, null, 'draft', time(), 'Invalid delivery record'); return; }
        if (!in_array($job['target'], self::targets(), true)) { self::update($post, $job, 'trash', time(), 'Target removed'); return; }
        if ($job['attempt'] >= 8) { self::update($post, $job, 'draft', time(), 'Attempts exhausted'); return; }
        $job['attempt']++;
        $job['claim'] = bin2hex(random_bytes(16));
        // Persist the attempt and lease before HTTP; cron removes its event before invoking us.
        $claimed = self::update($post, $job, self::RUNNING, time() + 120);
        if (!$claimed) return;
        $retry_after = 0;
        try {
            $secret = Utils::getSettings()->site->getSecret();
            if (!$secret) throw new RuntimeException('Missing secret');
            $timestamp = time();
            $signature = (new StandardWebhook(base64_encode($secret)))->sign($job['message_id'], $timestamp, $job['body']);
            $response = wp_remote_post($job['target'], [
                'headers' => ['Content-Type' => 'application/json', 'webhook-id' => $job['message_id'],
                    'webhook-timestamp' => $timestamp, 'webhook-signature' => $signature],
                'timeout' => 10, 'redirection' => 0, 'blocking' => true, 'body' => $job['body'],
            ]);
            $status = is_wp_error($response) ? 0 : wp_remote_retrieve_response_code($response);
            if ($status >= 200 && $status < 300) { self::update($claimed, $job, 'publish', time()); return; }
            $detail = is_wp_error($response) ? sanitize_key($response->get_error_code()) : 'HTTP ' . $status;
            $header = is_wp_error($response) ? null : wp_remote_retrieve_header($response, 'retry-after');
            if (is_string($header)) $retry_after = self::retryAfter($header);
        } catch (Throwable $error) {
            $detail = 'delivery_exception';
        }
        self::log($id, sprintf('%s target=%s attempt=%d failed (%s)', $job['message_id'], self::safeTarget($job['target']), $job['attempt'], $detail));
        $terminal = $job['attempt'] >= 8;
        $due = time() + ($terminal ? 0 : self::delay($job['attempt'], $retry_after));
        if (self::update($claimed, $job, $terminal ? 'draft' : 'pending', $due, $detail) && !$terminal) self::schedule($id, $due);
    }

    public static function retryAfter(string $value): int
    {
        $seconds = ctype_digit($value) ? (int) $value : max(0, (strtotime($value) ?: 0) - time());
        return min(86400, $seconds);
    }

    public static function delay(int $attempt, int $retry_after = 0): int
    {
        $base = self::DELAYS[$attempt - 1] ?? 43200;
        return max($base + random_int(0, (int) floor($base * 0.2)), min(86400, max(0, $retry_after)));
    }

    public function sweep(): void
    {
        $posts = get_posts(['post_type' => self::TYPE, 'post_status' => ['pending', self::RUNNING], 'numberposts' => 50,
            'orderby' => 'date', 'order' => 'ASC', 'date_query' => [['column' => 'post_date_gmt', 'before' => gmdate('Y-m-d H:i:s'), 'inclusive' => true]]]);
        foreach ($posts as $post) {
            $job = self::data($post);
            if (!$job) { self::update($post, null, 'draft', time(), 'Invalid delivery record'); continue; }
            $due = time() + 1;
            if ($post->post_status === self::RUNNING) {
                $terminal = $job['attempt'] >= 8;
                $due = time() + ($terminal ? 0 : self::delay($job['attempt']));
                if (!self::update($post, $job, $terminal ? 'draft' : 'pending', $due, 'Worker lease expired') || $terminal) continue;
            }
            self::schedule($post->ID, $due);
        }
        foreach (get_posts(['post_type' => self::TYPE, 'post_status' => ['draft', 'publish', 'trash'], 'numberposts' => 50,
            'orderby' => 'date', 'order' => 'ASC', 'date_query' => [['column' => 'post_date_gmt', 'before' => gmdate('Y-m-d H:i:s', time() - 30 * DAY_IN_SECONDS)]]]) as $post) wp_delete_post($post->ID, true);
    }

    public function replay(array $args): void
    {
        $post = get_post((int) ($args[0] ?? 0));
        if (!$post || $post->post_type !== self::TYPE || $post->post_status !== 'draft') { \WP_CLI::error('Choose a failed Kizlo delivery ID.'); return; }
        $job = self::data($post);
        if (!$job) { \WP_CLI::error('Invalid delivery record; repair the source before replay.'); return; }
        if (!in_array($job['target'], self::targets(), true)) {
            self::update($post, $job, 'trash', time(), 'Target removed');
            \WP_CLI::error('Target removed; delivery cancelled.'); return;
        }
        $job['attempt'] = 0;
        unset($job['claim']);
        if (!self::update($post, $job, 'pending', time(), 'Manual replay')) { \WP_CLI::error('Delivery changed; inspect its current status.'); return; }
        if (!self::schedule($post->ID, time() + 1)) { \WP_CLI::error('Delivery saved; recovery will retry scheduling.'); return; }
        \WP_CLI::success('Delivery ' . $post->ID . ' queued for replay.');
    }

    public function listing(array $args, array $options): void
    {
        $rows = [];
        foreach (get_posts(['post_type' => self::TYPE, 'post_status' => ['pending', self::RUNNING, 'draft', 'publish', 'trash'],
            'numberposts' => min(100, max(1, (int) ($options['limit'] ?? 20))), 'orderby' => 'ID', 'order' => 'DESC']) as $post) {
            $job = self::data($post);
            $rows[] = ['id' => $post->ID, 'status' => ['pending' => 'pending', self::RUNNING => 'running', 'draft' => 'failed', 'publish' => 'complete', 'trash' => 'cancelled'][$post->post_status],
                'attempt' => $job['attempt'] ?? '?', 'target' => self::safeTarget($job['target'] ?? ''), 'error' => $post->post_excerpt];
        }
        \WP_CLI\Utils\format_items('table', $rows, ['id', 'status', 'attempt', 'target', 'error']);
    }

    private static function schedule(int $id, int $due): bool
    {
        if (wp_next_scheduled(self::DELIVER, [$id]) !== false) return true;
        if (wp_schedule_single_event($due, self::DELIVER, [$id], true) === true) return true;
        self::log($id, 'Could not schedule delivery; the persistent record remains recoverable.');
        return false;
    }

    private static function encode(array $job): string
    {
        $json = wp_json_encode($job, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
        if ($json === false) throw new RuntimeException('Invalid delivery JSON');
        return $json;
    }

    private static function data(WP_Post $post): ?array
    {
        $job = json_decode($post->post_content, true);
        if (!is_array($job) || !is_string($job['message_id'] ?? null) || !is_string($job['target'] ?? null) || !is_string($job['body'] ?? null)
            || !is_int($job['created_at'] ?? null) || !is_int($job['attempt'] ?? null) || $job['attempt'] < 0) return null;
        return $job;
    }

    private static function update(WP_Post $post, ?array $job, string $status, int $due, string $error = ''): ?WP_Post
    {
        global $wpdb;
        $gmt = gmdate('Y-m-d H:i:s', $due);
        $fields = ['post_status' => $status, 'post_content' => $job === null ? $post->post_content : self::encode($job),
            'post_date_gmt' => $gmt, 'post_date' => get_date_from_gmt($gmt), 'post_modified_gmt' => gmdate('Y-m-d H:i:s'),
            'post_modified' => current_time('mysql'), 'post_excerpt' => $error];
        // Compare the claim-bearing content as well as the state so a stale worker cannot acknowledge a newer attempt.
        $result = $wpdb->update($wpdb->posts, $fields, ['ID' => $post->ID, 'post_type' => self::TYPE,
            'post_status' => $post->post_status, 'post_content' => $post->post_content, 'post_date_gmt' => $post->post_date_gmt]);
        if ($result !== 1) { self::log($post->ID, 'State update failed or another worker changed the delivery; recovery retains ownership.'); return null; }
        clean_post_cache($post->ID);
        return new WP_Post((object) array_merge((array) $post, $fields));
    }

    private static function safeTarget(string $target): string
    {
        $parts = wp_parse_url($target);
        return ($parts['scheme'] ?? '') . '://' . ($parts['host'] ?? '') . ($parts['path'] ?? '');
    }

    private static function log(int $id, string $message): void
    {
        error_log('Kizlo webhook delivery ' . $id . ': ' . $message);
    }

    public static function deactivate(): void
    {
        wp_unschedule_hook(self::DELIVER);
        wp_unschedule_hook(self::RECOVER);
    }
}
