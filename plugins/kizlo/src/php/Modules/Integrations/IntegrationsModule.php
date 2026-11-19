<?php

namespace Kizlo\Modules\Integrations;

use Kizlo\Modules\Introspection\CoreSchemas;
use WP_REST_Request;
use WP_REST_Response;

final class IntegrationsModule
{
    public function register(): void
    {
        $status = ['type' => 'object', 'properties' => [
            'phone_number_id' => ['type' => 'string', 'required' => true],
            'token_set' => ['type' => 'boolean', 'required' => true],
            'configured' => ['type' => 'boolean', 'required' => true],
        ]];
        $sent = ['type' => 'object', 'properties' => [
            'status' => ['type' => 'string', 'enum' => ['accepted'], 'required' => true],
            'provider_id' => ['type' => 'string', 'required' => true],
        ]];
        $this->route('kizlo.settings.integrations.whatsapp', 'retrieve', '/settings/integrations/whatsapp', 'GET', [], $status,
            static fn() => WhatsAppSettings::status());
        $this->route('kizlo.settings.integrations.whatsapp', 'update', '/settings/integrations/whatsapp', 'PUT', [
            'phone_number_id' => ['type' => 'string'],
            'api_token' => ['type' => 'string', 'description' => 'Write-only token. An empty string preserves the saved token.'],
            'clear_token' => ['type' => 'boolean'],
        ], $status, static fn(WP_REST_Request $request) => WhatsAppSettings::save((array) $request->get_json_params()));
        $this->route('kizlo.settings.integrations.whatsapp', 'test', '/settings/integrations/whatsapp/test', 'POST', [
            'to' => ['type' => 'string', 'required' => true],
        ], $sent, static fn(WP_REST_Request $request) => kizlo_get_integrations()->whatsapp->sendTemplate($request['to'], 'hello_world'));
        $this->route('kizlo.whatsapp', 'send', '/whatsapp/send', 'POST', [
            'to' => ['type' => 'string', 'required' => true],
            'type' => ['type' => 'string', 'enum' => ['text', 'document', 'template'], 'required' => true],
            'text' => ['type' => 'string'],
            'source' => ['type' => 'string', 'description' => 'Document media ID or public HTTPS URL.'],
            'filename' => ['type' => 'string'],
            'caption' => ['type' => 'string'],
            'name' => ['type' => 'string', 'description' => 'Approved template name.'],
            'language' => ['type' => 'string'],
            'components' => ['type' => 'array', 'items' => ['type' => 'object', 'additionalProperties' => true]],
        ], $sent, static function (WP_REST_Request $request) {
            $client = kizlo_get_integrations()->whatsapp;
            return match ($request['type']) {
                'text' => $client->sendText($request['to'], $request['text'] ?? ''),
                'document' => $client->sendDocument($request['to'], $request['source'] ?? '', $request['filename'] ?? 'invoice.pdf', $request['caption'] ?? ''),
                'template' => $client->sendTemplate($request['to'], $request['name'] ?? '', $request['language'] ?? 'en_US', $request['components'] ?? []),
                default => new \WP_Error('kizlo_whatsapp_invalid', 'Choose text, document or template.', ['status' => 400]),
            };
        });
    }

    private function route(string $id, string $operation, string $path, string $method, array $properties, array $response, callable $callback): void
    {
        kizlo_register_route([
            'id' => $id, 'operation' => $operation, 'route' => $path, 'method' => $method,
            'summary' => $operation . ' WhatsApp ' . ($id === 'kizlo.whatsapp' ? 'message' : 'integration'),
            'input' => ['type' => 'object', 'properties' => $properties],
            'errors' => ['kizlo_whatsapp_invalid', 'kizlo_whatsapp_credentials', 'kizlo_whatsapp_unavailable', 'kizlo_whatsapp_failed', 'kizlo_whatsapp_unknown'],
            'responses' => [
                '200' => ['description' => 'WhatsApp operation result.', 'body' => $response],
                '400' => ['description' => 'Invalid settings or message.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                '502' => ['description' => 'Meta did not confirm the message.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                '503' => ['description' => 'The connection is unavailable or its outcome is unknown.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback' => static function (WP_REST_Request $request) use ($callback) {
                $result = $callback($request);
                return is_wp_error($result) ? $result : new WP_REST_Response($result, 200, ['Cache-Control' => 'private, no-store']);
            },
        ]);
    }
}
