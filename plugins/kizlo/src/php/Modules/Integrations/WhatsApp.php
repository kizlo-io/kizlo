<?php

namespace Kizlo\Modules\Integrations;

use WP_Error;

final class WhatsApp
{
    public function isConfigured(): bool
    {
        return WhatsAppSettings::status()['configured'];
    }

    public function sendText(string $to, string $text): array|WP_Error
    {
        if (trim($text) === '' || mb_strlen($text) > 4096) return $this->invalid('Enter a message of 1–4096 characters.');
        return $this->send($to, ['type' => 'text', 'text' => ['body' => $text, 'preview_url' => true]]);
    }

    /** $source is an uploaded Meta media ID or a publicly accessible HTTPS URL. */
    public function sendDocument(string $to, string $source, string $filename = 'invoice.pdf', string $caption = ''): array|WP_Error
    {
        $media = preg_match('/^[1-9][0-9]*$/D', $source) ? ['id' => $source] : ['link' => $source];
        $url = wp_parse_url($source);
        if (isset($media['link']) && (!is_array($url) || ($url['scheme'] ?? '') !== 'https' || empty($url['host']) || isset($url['user']) || isset($url['pass']))) return $this->invalid('Use a Meta media ID or a public HTTPS document URL.');
        if ($filename === '' || mb_strlen($filename) > 255 || mb_strlen($caption) > 1024) return $this->invalid('Check the document filename and caption.');
        return $this->send($to, ['type' => 'document', 'document' => $media + ['filename' => sanitize_file_name($filename), 'caption' => $caption]]);
    }

    public function sendTemplate(string $to, string $name, string $language = 'en_US', array $components = []): array|WP_Error
    {
        if (!preg_match('/^[a-z0-9_]{1,512}$/D', $name) || !preg_match('/^[a-z]{2,3}(?:_[A-Z]{2})?$/D', $language) || !array_is_list($components) || count($components) > 100) return $this->invalid('Check the WhatsApp template name, language and components.');
        foreach ($components as $component) if (!is_array($component) || !isset($component['type'])) return $this->invalid('Each template component needs a type.');
        $template = ['name' => $name, 'language' => ['code' => $language]];
        if ($components !== []) $template['components'] = $components;
        return $this->send($to, ['type' => 'template', 'template' => $template]);
    }

    private function invalid(string $message): WP_Error
    {
        return new WP_Error('kizlo_whatsapp_invalid', $message, ['status' => 400]);
    }

    private function send(string $to, array $message): array|WP_Error
    {
        $to = preg_replace('/[\s().-]/', '', $to);
        if (!preg_match('/^\+?[1-9][0-9]{6,14}$/D', $to)) return $this->invalid('Enter the recipient number with its country code.');
        $settings = WhatsAppSettings::status();
        if (!$settings['configured']) return new WP_Error('kizlo_whatsapp_credentials', 'Configure WhatsApp in Kizlo → Integrations → WhatsApp.', ['status' => 503]);
        $token = WhatsAppSettings::token();
        if (is_wp_error($token)) return $token;
        $body = wp_json_encode(['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => ltrim($to, '+')] + $message);
        if ($body === false || strlen($body) > 131072) return $this->invalid('The WhatsApp message is too large or invalid.');
        $response = wp_remote_post('https://graph.facebook.com/v27.0/' . $settings['phone_number_id'] . '/messages', [
            'headers' => ['Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json'],
            'body' => $body, 'timeout' => 20, 'redirection' => 0,
        ]);
        if (is_wp_error($response)) return new WP_Error('kizlo_whatsapp_unknown', 'The delivery status is unknown. Check WhatsApp before resending.', ['status' => 503, 'delivery_status' => 'unknown']);
        $code = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if ($code < 200 || $code >= 300 || !is_array($data) || !is_string($data['messages'][0]['id'] ?? null) || $data['messages'][0]['id'] === '') {
            // Provider error text can echo credentials; only return our own message.
            $status = $code >= 500 || ($code >= 200 && $code < 300) ? 'unknown' : 'failed';
            return new WP_Error('kizlo_whatsapp_failed', 'WhatsApp did not confirm the message. Check your token, recipient and messaging window before trying again.', ['status' => 502, 'delivery_status' => $status]);
        }
        return ['status' => 'accepted', 'provider_id' => $data['messages'][0]['id']];
    }
}
