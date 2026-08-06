<?php

namespace Kizlo\Modules\CustomFields;

use Throwable;
use WP_Post;
use InvalidArgumentException;
use Kizlo\Support\Asset;
use Kizlo\Support\Utils;

/**
 * Per-post custom-fields editor.
 *
 * Mounts one React root per Kizlo-managed post type that has custom fields
 * configured, hydrated with the post's current values. On save the flattened
 * `kizlo_custom_fields` payload is validated and written through
 * {@see CustomFieldsStore}; a rejected payload surfaces as an admin notice instead
 * of a partial save.
 */
class PostCustomFieldsMetaBox
{
    private const NONCE  = 'kizlo_custom_fields_nonce';
    private const ACTION = 'kizlo_custom_fields_save';

    public function register(): void
    {
        add_action('add_meta_boxes', [$this, 'addMetaBox']);
        add_action('save_post', [$this, 'save']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    public function addMetaBox(): void
    {
        foreach (Utils::getSettings()->postTypes->all() as $post_type => $settings) {
            if (empty($settings->getCustomFields())) continue;

            add_meta_box('kizlo-custom-fields', 'Custom Fields', [$this, 'render'], $post_type, 'normal', 'default');
        }
    }

    public function enqueue(string $hook): void
    {
        if (!in_array($hook, ['post.php', 'post-new.php'], true)) return;

        $screen = get_current_screen();
        if (!$screen) return;

        $settings = Utils::getSettings()->postTypes->all()[$screen->post_type] ?? null;
        if (!$settings || empty($settings->getCustomFields())) return;

        wp_enqueue_media();
        wp_enqueue_style('wp-components');
        wp_enqueue_style('kizlo-styles', KIZLO_URL . 'build/shared/styles.css', [], (string) time());

        Asset::enqueue('kizlo-custom-fields', self::class, [], 'custom-fields');
    }

    public function render(WP_Post $post): void
    {
        $definitions = Utils::getSettings()->postTypes->get($post->post_type)->getCustomFields();
        if (empty($definitions)) return;

        wp_nonce_field(self::ACTION, self::NONCE);

        wp_add_inline_script(
            'kizlo-custom-fields',
            'window.kizloCustomFields = ' . wp_json_encode([
                'definitions' => $definitions,
                'values'      => CustomFieldsStore::read(CustomFieldsStore::META_POST, $post->ID, $definitions),
            ]) . ';',
            'before'
        );

        echo '<div id="kizlo-custom-fields-root"></div>';
    }

    public function save(int $post_id): void
    {
        if (!isset($_POST[self::NONCE]) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST[self::NONCE])), self::ACTION)) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (wp_is_post_revision($post_id)) return;
        if (!current_user_can('edit_post', $post_id)) return;

        $definitions = Utils::getSettings()->postTypes->get(get_post_type($post_id))->getCustomFields();
        if (empty($definitions)) return;

        $raw = isset($_POST['kizlo_custom_fields']) ? json_decode(wp_unslash($_POST['kizlo_custom_fields']), true) : null;
        if (!is_array($raw)) return;

        try {
            CustomFieldsStore::write(CustomFieldsStore::META_POST, $post_id, $definitions, $raw);
        } catch (InvalidArgumentException $e) {
            CustomFieldsNotice::flash($e->getMessage());
        } catch (Throwable $e) {
            kizlo_log('Post custom fields save failed: ' . $e->getMessage());
        }
    }
}
