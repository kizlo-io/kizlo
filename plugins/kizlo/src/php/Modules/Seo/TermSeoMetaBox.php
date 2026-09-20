<?php

namespace Kizlo\Modules\Seo;

use Throwable;
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
        // Priority 30: after Registrar::registerObjects() at 20, so the managed set is
        // complete. Reading it during boot would leave the term editor for every
        // taxonomy an extension plugin contributes without these fields. Both hooks
        // below belong to admin screens, which run long after init.
        add_action('init', [$this, 'registerTaxonomyFields'], 30);

        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    public function registerTaxonomyFields(): void
    {
        foreach (array_keys(Utils::getSettings()->taxonomies->all()) as $taxonomy) {
            add_action("{$taxonomy}_edit_form_fields", [$this, 'render']);
            add_action("edited_{$taxonomy}", [$this, 'save']);
        }
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
        $settings          = Utils::getSettings();
        $seo               = new TermSchema($settings);
        $taxonomy_settings = $settings->taxonomies->get($term->taxonomy);

        wp_nonce_field(self::ACTION, self::NONCE);

        wp_add_inline_script(
            'kizlo-seo',
            'window.kizloSeo = ' . wp_json_encode([
                'variant'   => 'term',
                'meta'      => $this->getMeta($term),
                'defaults'  => $seo->seoDefaults($term),
                'variables' => Variables::toJSON('taxonomy_content'),
                'templates' => [
                    'title'       => $taxonomy_settings->getTitleStructure() ?? Variables::DEFAULT_TAX_TITLE_TEMPLATE,
                    'description' => $taxonomy_settings->getDescriptionStructure() ?? Variables::DEFAULT_TAX_DESC_TEMPLATE,
                    'canonical'   => $seo->canonicalTemplate($term),
                ],
                'context'   => $seo->previewContext($term),
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

        try {
            SeoOverridesStore::write(
                SeoOverridesStore::META_TERM,
                $term_id,
                SeoOverridesStore::fromEditor(SeoOverridesStore::META_TERM, $raw)
            );
        } catch (Throwable $e) {
            kizlo_log('Term SEO overrides save failed: ' . $e->getMessage());
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
        $stored = SeoOverridesStore::read(SeoOverridesStore::META_TERM, $term->term_id);
        $get    = fn(string $field) => $stored[$field];

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
