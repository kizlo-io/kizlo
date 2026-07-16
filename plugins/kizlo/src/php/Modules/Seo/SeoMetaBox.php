<?php

namespace Kizlo\Modules\Seo;

use WP_Post;
use Kizlo\Support\Asset;
use Kizlo\Support\Utils;
use Kizlo\Support\Variables;
use Kizlo\Modules\Post\PostSchema;

/**
 * Per-post SEO override meta box.
 *
 * Renders a React root in the editor that lets an author override the SEO
 * details Kizlo otherwise resolves from post-type templates. Empty fields fall
 * back to those defaults; only populated overrides are persisted.
 */
class SeoMetaBox
{
    private const NONCE  = 'kizlo_seo_nonce';
    private const ACTION = 'kizlo_seo_save';

    public function register(): void
    {
        add_action('add_meta_boxes', [$this, 'addMetaBox']);
        add_action('save_post', [$this, 'save']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    /**
     * Register the meta box for every Kizlo-managed post type.
     */
    public function addMetaBox(): void
    {
        foreach (array_keys(Utils::getSettings()->postTypes->all()) as $post_type) {
            add_meta_box('kizlo-seo', 'SEO Settings', [$this, 'render'], $post_type, 'normal', 'high');
        }
    }

    /**
     * Enqueue the meta box assets on the post edit screens of managed post types.
     */
    public function enqueue(string $hook): void
    {
        if (! in_array($hook, ['post.php', 'post-new.php'], true)) return;

        $screen = get_current_screen();
        if (! $screen || ! array_key_exists($screen->post_type, Utils::getSettings()->postTypes->all())) return;

        wp_enqueue_media();
        wp_enqueue_style('wp-components');
        wp_enqueue_style('kizlo-styles', KIZLO_URL . 'build/shared/styles.css', [], (string) time());

        Asset::enqueue('kizlo-seo', self::class);
    }

    /**
     * Output the meta box markup and hand the current overrides + resolved
     * defaults to the React root via a `window.kizloSeo` global.
     */
    public function render(WP_Post $post): void
    {
        $settings           = Utils::getSettings();
        $seo                = new PostSchema($settings);
        $post_type_settings = $settings->postTypes->get($post->post_type);

        wp_nonce_field(self::ACTION, self::NONCE);

        wp_add_inline_script(
            'kizlo-seo',
            'window.kizloSeo = ' . wp_json_encode([
                'meta'      => $this->getMeta($post),
                'defaults'  => $seo->seoDefaults($post),
                'variables' => Variables::forPostType($post->post_type),
                'templates' => [
                    'title'       => $post_type_settings->getTitleStructure() ?? Variables::DEFAULT_POST_TITLE_TEMPLATE,
                    'description' => $post_type_settings->getDescriptionStructure() ?? Variables::DEFAULT_POST_DESC_TEMPLATE,
                    'canonical'   => $seo->canonicalTemplate($post),
                ],
                'context'   => $seo->previewContext($post),
            ]) . ';',
            'before'
        );

        echo '<div id="kizlo-seo-root"></div>';
    }

    /**
     * Persist the submitted overrides. Empty fields are dropped so the post
     * keeps falling back to the post-type defaults.
     */
    public function save(int $post_id): void
    {
        if (! isset($_POST[self::NONCE]) || ! wp_verify_nonce(sanitize_text_field(wp_unslash($_POST[self::NONCE])), self::ACTION)) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (wp_is_post_revision($post_id)) return;
        if (! current_user_can('edit_post', $post_id)) return;

        $raw = isset($_POST['kizlo_seo']) ? json_decode(wp_unslash($_POST['kizlo_seo']), true) : null;
        $raw = is_array($raw) ? $raw : [];

        $values = [
            'title'               => sanitize_text_field($raw['title'] ?? ''),
            'description'         => sanitize_textarea_field($raw['description'] ?? ''),
            'canonical'           => esc_url_raw($raw['canonical'] ?? ''),
            'webpage_type'        => sanitize_text_field($raw['webpage_type'] ?? ''),
            'article_type'        => sanitize_text_field($raw['article_type'] ?? ''),
            'og_title'            => sanitize_text_field($raw['og_title'] ?? ''),
            'og_description'      => sanitize_textarea_field($raw['og_description'] ?? ''),
            'og_image_id'         => isset($raw['og_image_id']) ? absint($raw['og_image_id']) : 0,
            'twitter_title'       => sanitize_text_field($raw['twitter_title'] ?? ''),
            'twitter_description' => sanitize_textarea_field($raw['twitter_description'] ?? ''),
            'twitter_image_id'    => isset($raw['twitter_image_id']) ? absint($raw['twitter_image_id']) : 0,
            'noindex'             => ! empty($raw['noindex']) ? '1' : '',
            'nofollow'            => ! empty($raw['nofollow']) ? '1' : '',
        ];

        foreach ($values as $field => $value) {
            $meta_key = SeoBase::OVERRIDE_KEYS[$field];

            if (empty($value)) {
                delete_post_meta($post_id, $meta_key);
            } else {
                update_post_meta($post_id, $meta_key, $value);
            }
        }
    }

    /**
     * Shape the stored overrides for the editor, resolving override images to
     * preview URLs and grouping the social fields per network.
     *
     * @return array{
     *     title: string, description: string, canonical: string,
     *     webpage_type: string, article_type: string, noindex: bool, nofollow: bool,
     *     og: array{title: string, description: string, image: array{id: int, url: string|null}|null},
     *     twitter: array{title: string, description: string, image: array{id: int, url: string|null}|null},
     * }
     */
    private function getMeta(WP_Post $post): array
    {
        $get = fn(string $field) => (string) get_post_meta($post->ID, SeoBase::OVERRIDE_KEYS[$field], true);

        return [
            'title'        => $get('title'),
            'description'  => $get('description'),
            'canonical'    => $get('canonical'),
            'webpage_type' => $get('webpage_type'),
            'article_type' => $get('article_type'),
            'noindex'      => $get('noindex') === '1',
            'nofollow'     => $get('nofollow') === '1',
            'og'           => [
                'title'       => $get('og_title'),
                'description' => $get('og_description'),
                'image'       => $this->imagePreview($get('og_image_id')),
            ],
            'twitter'      => [
                'title'       => $get('twitter_title'),
                'description' => $get('twitter_description'),
                'image'       => $this->imagePreview($get('twitter_image_id')),
            ],
        ];
    }

    /**
     * Resolve an attachment id to an {id, url} preview shape for the editor.
     *
     * @param int|string $id
     *
     * @return array{id: int, url: string|null}|null
     */
    private function imagePreview($id): ?array
    {
        $id = (int) $id;

        return $id ? ['id' => $id, 'url' => wp_get_attachment_url($id) ?: null] : null;
    }
}
