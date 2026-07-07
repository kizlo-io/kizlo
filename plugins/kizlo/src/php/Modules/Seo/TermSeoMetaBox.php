<?php

namespace Kizlo\Modules\Seo;

use WP_Term;
use Kizlo\Support\Asset;
use Kizlo\Support\Utils;
use Kizlo\Support\Variables;

/**
 * Per-term SEO override editor.
 *
 * Mounts the same React root as the post meta box on the edit-term screen of
 * every Kizlo-managed taxonomy, letting an editor override the SEO details
 * Kizlo otherwise resolves from the taxonomy templates. Terms are always a
 * Schema.org CollectionPage and have no featured image, so the schema-type and
 * article fields are hidden; the exposed subset is content, robots and social.
 * Overrides live in term meta (a separate table from post meta, so the shared
 * override keys never collide).
 */
class TermSeoMetaBox
{
    private const NONCE  = 'kizlo_term_seo_nonce';
    private const ACTION = 'kizlo_term_seo_save';

    public function register(): void
    {
        foreach (array_keys(Utils::getSettings()->taxonomies->all()) as $taxonomy) {
            add_action("{$taxonomy}_edit_form_fields", [$this, 'render']);
            add_action("edited_{$taxonomy}", [$this, 'save']);
        }

        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    /**
     * Enqueue the editor assets on the edit-term screen of a managed taxonomy.
     */
    public function enqueue(string $hook): void
    {
        if ($hook !== 'term.php') return;

        $screen = get_current_screen();
        if (! $screen || ! array_key_exists($screen->taxonomy, Utils::getSettings()->taxonomies->all())) return;

        wp_enqueue_media();
        wp_enqueue_style('wp-components');
        wp_enqueue_style('kizlo-styles', KIZLO_URL . 'build/shared/styles.css', [], (string) time());

        Asset::enqueue('kizlo-seo', self::class);
    }

    /**
     * Render the React root as a full-width row in the term edit form and hand
     * the current overrides + resolved defaults to it via `window.kizloSeo`.
     */
    public function render(WP_Term $term): void
    {
        $seo = new TermSchema(Utils::getSettings());

        wp_nonce_field(self::ACTION, self::NONCE);

        wp_add_inline_script(
            'kizlo-seo',
            'window.kizloSeo = ' . wp_json_encode([
                'variant'   => 'term',
                'meta'      => $this->getMeta($term),
                'defaults'  => $seo->seoDefaults($term),
                'variables' => Variables::toJSON('taxonomy_content'),
            ]) . ';',
            'before'
        );

        echo '<tr class="form-field"><th scope="row"><label></label></th><td><div id="kizlo-seo-root"></div></td></tr>';
    }

    /**
     * Persist the submitted overrides to term meta. Empty fields are dropped so
     * the term keeps falling back to the taxonomy defaults.
     */
    public function save(int $term_id): void
    {
        if (! isset($_POST[self::NONCE]) || ! wp_verify_nonce(sanitize_text_field(wp_unslash($_POST[self::NONCE])), self::ACTION)) return;
        if (! current_user_can('edit_term', $term_id)) return;

        $raw = isset($_POST['kizlo_seo']) ? json_decode(wp_unslash($_POST['kizlo_seo']), true) : null;
        $raw = is_array($raw) ? $raw : [];

        $values = [
            'title'               => sanitize_text_field($raw['title'] ?? ''),
            'description'         => sanitize_textarea_field($raw['description'] ?? ''),
            'canonical'           => esc_url_raw($raw['canonical'] ?? ''),
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
                delete_term_meta($term_id, $meta_key);
            } else {
                update_term_meta($term_id, $meta_key, $value);
            }
        }
    }

    /**
     * Shape the stored term overrides for the editor, resolving override images
     * to preview URLs and grouping the social fields per network.
     *
     * @return array{
     *     title: string, description: string, canonical: string,
     *     webpage_type: string, article_type: string, noindex: bool, nofollow: bool,
     *     og: array{title: string, description: string, image: array{id: int, url: string|null}|null},
     *     twitter: array{title: string, description: string, image: array{id: int, url: string|null}|null},
     * }
     */
    private function getMeta(WP_Term $term): array
    {
        $get = fn(string $field) => (string) get_term_meta($term->term_id, SeoBase::OVERRIDE_KEYS[$field], true);

        return [
            'title'        => $get('title'),
            'description'  => $get('description'),
            'canonical'    => $get('canonical'),
            'webpage_type' => '',
            'article_type' => '',
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
