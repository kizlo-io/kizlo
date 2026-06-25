<?php

namespace Kizlo\Modules\Webhook;

use Kizlo\Support\Utils;
use StandardWebhooks\Webhook as StandardWebhook;

class Webhook
{
    const POST_CREATED_EVENT = 'post.created';
    const POST_UPDATED_EVENT = 'post.updated';
    const POST_DELETED_EVENT = 'post.deleted';
    const POST_TRASHED_EVENT = 'post.trashed';

    const TERM_CREATED_EVENT = 'term.created';
    const TERM_UPDATED_EVENT = 'term.updated';
    const TERM_DELETED_EVENT = 'term.deleted';

    const SETTINGS_SAVED_EVENT = 'settings.saved';

    const KIZLO_WEBHOOK_URL = 'http://localhost:9191/plugin/webhooks';

    public static function sendEvent(string $type, array|null $data = null)
    {
        $settings = Utils::getSettings();
        $urls = $settings->webhook->getWebhookUrls();
        $plugin_secret = $settings->site->getSecret();

        if (empty($plugin_secret) || empty($urls)) return false;

        $timestamp = time();
        $msg_id = 'msg_' . uniqid();

        $body = wp_json_encode([
            'type' => $type,
            'data' => $data,
        ]);

        $wh = new StandardWebhook(base64_encode($plugin_secret));
        $signature = $wh->sign($msg_id, $timestamp, $body);

        $success = true;

        foreach ($urls as $url) {
            $response = wp_remote_post($url, [
                'headers' => [
                    'Content-Type'      => 'application/json',
                    'webhook-id'        => $msg_id,
                    'webhook-timestamp' => $timestamp,
                    'webhook-signature' => $signature,
                ],
                'timeout'  => 1,
                'body'     => $body,
                'blocking' => false,
            ]);

            if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
                $success = false;
            }
        }

        return $success;
    }
}
