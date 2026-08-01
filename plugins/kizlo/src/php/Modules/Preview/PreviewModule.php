<?php

namespace Kizlo\Modules\Preview;

use WP_Post;
use Kizlo\Support\Asset;
use Kizlo\Support\Utils;

class PreviewModule
{
    public function __construct() {}

    public function register(): void
    {
        $this->registerIntegrations();
        $this->registerPostStatuses();

        add_action('admin_enqueue_scripts', [$this, 'enqueueScripts']);
        add_action('enqueue_block_editor_assets', [$this, 'enqueueEditorAssets']);
        add_action('wp_ajax_kizlo_preview_token', [$this, 'ajaxHandler']);
        add_action('post_submitbox_misc_actions', [$this, 'ajaxCaller']);
    }

    public function registerPostStatuses()
    {
        register_post_status('kizlo_preview', [
            'label'                     => 'Kizlo Preview',
            'public'                    => false,
            'show_in_admin_all_list'    => true,
            'show_in_admin_status_list' => true,
            'exclude_from_search'       => true,
        ]);
    }

    /**
     * Classic editor: hijack the native Preview button. The block editor has no
     * such button, so its assets load separately via `enqueueEditorAssets`.
     */
    public function enqueueScripts(string $hook): void
    {
        if (! in_array($hook, ['post.php', 'post-new.php'], true)) {
            return;
        }

        $screen = get_current_screen();
        if ($screen && $screen->is_block_editor()) {
            return;
        }

        Asset::enqueue('kizlo-preview', self::class);
    }

    /**
     * Block editor: register the "Kizlo Preview" item in the native Preview
     * dropdown. Data is localized here since `post_submitbox_misc_actions`
     * (the classic path) never fires in Gutenberg.
     */
    public function enqueueEditorAssets(): void
    {
        $post = get_post();
        if (! $post) {
            return;
        }

        Asset::enqueue('kizlo-preview-editor', self::class, name: 'preview-editor');

        wp_localize_script('kizlo-preview-editor', 'kizloPreviewData', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'postId'  => $post->ID,
            'nonce'   => wp_create_nonce('kizlo_preview_' . $post->ID),
        ]);

        wp_register_style('kizlo-preview-editor', false);
        wp_enqueue_style('kizlo-preview-editor');
        wp_add_inline_style(
            'kizlo-preview-editor',
            '.components-menu-group:has(a[target^="wp-preview-"]){display:none !important;}'
        );
    }

    /**
     * Register built-in meta integrations for popular plugins.
     */
    public function registerIntegrations(): void
    {
        add_action('kizlo_preview_save_meta', function (int $new_post_id): void {
            if (function_exists('acf_save_post')) {
                acf_save_post($new_post_id);
            }
        });
    }

    /**
     * Handle the preview AJAX request.
     * Creates a draft clone of the post with current form data and meta.
     */
    public function ajaxHandler(): void
    {
        try {
            $post = get_post(absint($_POST['post_id'] ?? 0));

            if (! $post || ! current_user_can('edit_post', $post->ID)) {
                wp_send_json_error('Forbidden', 403);
            }

            if (! check_ajax_referer('kizlo_preview_' . $post->ID, '_kizlo_nonce', false)) {
                wp_send_json_error('Invalid nonce', 403);
            }

            $preview_id = get_post_meta($post->ID, '_kizlo_preview', true) ?: null;
            $preview_post = $preview_id ? get_post($preview_id) : null;

            $_POST = array_merge($_POST, [
                'post_name'    => $post->ID,
                'post_parent'  => $post->ID,
                'post_status'  => 'kizlo_preview',
                'post_type'    => $post->post_type,
                'post_content' => wp_kses_post($_POST['content']),
                'ID'           => $preview_post ? $preview_post->ID : '',
                'post_title'   => sanitize_text_field($_POST['post_title']),
                'post_excerpt' => sanitize_textarea_field($_POST['excerpt']),
            ]);

            $new_post_id = apply_filters('kizlo_preview_handle', null, $post, $preview_post);

            if (empty($new_post_id)) {
                $new_post_id = $this->handleDefault($post, $preview_post);
            }

            if (empty($new_post_id)) {
                wp_send_json_error('Failed to preview.', 403);
            }

            do_action('kizlo_preview_save_meta', $new_post_id, $post->ID, $_POST);

            wp_send_json_success([
                'preview_url' => $this->getPreviewUrl($post, get_post($new_post_id))
            ]);
        } catch (\Throwable $e) {
            kizlo_log($e->getMessage());
            wp_send_json_error($e->getMessage(), 500);
        }
    }

    /**
     * Default preview-save. Clones any standard post type (post, page, and
     * custom types without a dedicated `kizlo_preview_handle` integration).
     */
    private function handleDefault(WP_Post $post, ?WP_Post $preview_post = null): int
    {
        if ($preview_post) {
            $new_post_id = $preview_post->ID;
            wp_update_post(wp_slash($_POST));
        } else {
            $new_post_id = wp_insert_post(wp_slash($_POST), true);
            if (is_wp_error($new_post_id)) {
                wp_send_json_error('Failed to create preview', 500);
            }

            update_post_meta($post->ID, '_kizlo_preview', $new_post_id);
        }

        return $new_post_id;
    }

    public function ajaxCaller(): void
    {
        global $post;

        if (! $post) return;

        $has_slug  = ! empty($post->post_name) && $post->post_name !== 'auto-draft';
        $has_title = trim($post->post_title) !== '';

        wp_localize_script('kizlo-preview', 'kizloPreviewData', [
            'ajaxUrl'   => admin_url('admin-ajax.php'),
            'postId'    => $post->ID,
            'nonce'     => wp_create_nonce('kizlo_preview_' . $post->ID),
            'isNewPost' => ! $has_slug && ! $has_title,
        ]);
    }

    public function getPreviewUrl(WP_Post $post, WP_Post $preview_post): string
    {
        $expires = time() + 600;

        // Resolve the URL from the original post so its path matches the front-end
        // route (whether a dynamic `[slug]` segment or a static pathname). The
        // preview clone's own permalink is keyed on a numeric slug and would not
        // match a static route. The signed token carries the clone's id, which is
        // what actually drives the fetched preview content.
        $settings           = Utils::getSettings();
        $post_type_settings = $settings->postTypes->get($post->post_type);

        $post_for_url = clone $post;
        if (empty($post_for_url->post_name)) {
            $submitted_title = sanitize_text_field($_POST['post_title'] ?? $post->post_title);
            $post_for_url->post_name = sanitize_title($submitted_title);
        }
        $post_for_url->post_status = 'publish';

        $url = untrailingslashit($settings->resolvePostUrl($post_for_url, $post_type_settings));

        $payload = [
            'id'      => $preview_post->ID,
            'parent'  => $preview_post->post_parent,
            'expires' => $expires,
        ];

        $payload_str = implode('.', [
            $payload['id'],
            $payload['parent'],
            $payload['expires'],
        ]);

        $hash = hash_hmac('sha256', $payload_str, $settings->site->getSecret());
        $token_data = ['payload' => $payload, 'hash' => $hash];
        $preview_token = $this->base64url_encode(json_encode($token_data));

        return add_query_arg(['preview_token' => $preview_token], $url);
    }

    private function base64url_encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
