<?php

/**
 * PHPStan stubs for the Kizlo core plugin's public PHP API.
 *
 * Integration plugins (kizlo-cf7, kizlo-woocommerce) reference these `kizlo_*`
 * helpers, the KIZLO_API_NAMESPACE constant, and a couple of core classes, but
 * their real definitions live in the separate kizlo core plugin and aren't
 * visible to PHPStan when analyzing a sibling plugin in isolation. This file
 * declares the signatures so analysis resolves them instead of reporting
 * `function.notFound` / `class.notFound` / `constant.notFound`.
 *
 * Signatures must mirror the kizlo core plugin (src/php/Support/functions.php,
 * Modules/Admin/Components.php, Modules/Webhook/Webhook.php). Stub only — never
 * loaded at runtime, never shipped (phpstan config is .distignore'd).
 */

namespace {
    const KIZLO_API_NAMESPACE = 'kizlo/v1';

    /** @return string */
    function kizlo_get_path($filename = '') {}

    /** @return void */
    function kizlo_include($filename = '') {}

    /**
     * @param mixed $data
     * @param bool  $append
     * @return void
     */
    function kizlo_log($data = '✨', $append = true) {}

    function kizlo_route(string $path): string {}

    function kizlo_route_match(string $route, \WP_REST_Request $request): bool {}

    function kizlo_register_route(array $args): void {}

    /**
     * @param array $args
     * @throws \InvalidArgumentException
     */
    function kizlo_register_route_interceptor(array $args) {}

    /**
     * @param mixed $arg
     * @return array{extend: array}
     */
    function kizlo_apply_extend_filter(string $name, $arg = []): array {}

    /** @return array{id: int, url: string} */
    function kizlo_ensure_media_data(int $id): array {}

    function kizlo_extend_post_type(string $post_type, callable $callback): void {}

    function kizlo_extend_post_type_item(string $post_type, callable $callback): void {}

    function kizlo_include_post_type(string $post_type): void {}

    function kizlo_include_taxonomy(string $taxonomy): void {}
}

namespace Kizlo\Modules\Admin {
    class Components
    {
        /** @param array<string, mixed> $args */
        public static function media(array $args): void {}
    }
}

namespace Kizlo\Modules\Webhook {
    class Webhook
    {
        const POST_CREATED_EVENT = 'post.created';
        const POST_UPDATED_EVENT = 'post.updated';
        const POST_DELETED_EVENT = 'post.deleted';
        const POST_TRASHED_EVENT = 'post.trashed';

        /** @param array<string, mixed>|null $data */
        public static function sendEvent(string $type, array|null $data = null) {}
    }
}
