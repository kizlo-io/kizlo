<?php

namespace Kizlo\Modules\CustomFields;

use Throwable;
use WP_Term;
use InvalidArgumentException;
use Kizlo\Support\Asset;
use Kizlo\Support\Utils;

/**
 * Per-term custom-fields editor.
 *
 * Mounts the same React root as the post metabox on the add-term and edit-term
 * screens of every Kizlo-managed taxonomy that has custom fields configured. On
 * `created_`/`edited_` the flattened `kizlo_custom_fields` payload is validated and
 * written to term meta through {@see CustomFieldsStore}; a rejected payload surfaces
 * as an admin notice instead of a partial save.
 */
class TermCustomFieldsForm
{
    private const NONCE  = 'kizlo_custom_fields_term_nonce';
    private const ACTION = 'kizlo_custom_fields_term_save';

    public function register(): void
    {
        foreach ($this->managedTaxonomies() as $taxonomy) {
            add_action("{$taxonomy}_add_form_fields", [$this, 'renderAdd']);
            add_action("{$taxonomy}_edit_form_fields", [$this, 'renderEdit']);
            add_action("created_{$taxonomy}", [$this, 'save']);
            add_action("edited_{$taxonomy}", [$this, 'save']);
        }

        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    public function enqueue(string $hook): void
    {
        if (!in_array($hook, ['edit-tags.php', 'term.php'], true)) return;

        $screen = get_current_screen();
        if (!$screen || !in_array($screen->taxonomy, $this->managedTaxonomies(), true)) return;

        wp_enqueue_media();
        wp_enqueue_style('wp-components');
        wp_enqueue_style('kizlo-styles', KIZLO_URL . 'build/shared/styles.css', [], (string) time());

        Asset::enqueue('kizlo-custom-fields', self::class, [], 'custom-fields');
    }

    public function renderAdd(string $taxonomy): void
    {
        $definitions = Utils::getSettings()->taxonomies->get($taxonomy)->getCustomFields();
        if (empty($definitions)) return;

        $this->inlinePayload($definitions, []);

        echo '<div class="form-field">';
        wp_nonce_field(self::ACTION, self::NONCE);
        echo '<div id="kizlo-custom-fields-root"></div></div>';
    }

    public function renderEdit(WP_Term $term): void
    {
        $definitions = Utils::getSettings()->taxonomies->get($term->taxonomy)->getCustomFields();
        if (empty($definitions)) return;

        $values = CustomFieldsStore::read(CustomFieldsStore::META_TERM, $term->term_id, $definitions);

        $this->inlinePayload($definitions, $values);

        echo '<tr class="form-field"><th scope="row"><label>Custom Fields</label></th><td>';
        wp_nonce_field(self::ACTION, self::NONCE);
        echo '<div id="kizlo-custom-fields-root"></div></td></tr>';
    }

    public function save(int $term_id): void
    {
        if (!isset($_POST[self::NONCE]) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST[self::NONCE])), self::ACTION)) return;
        if (!current_user_can('edit_term', $term_id)) return;

        $term = get_term($term_id);
        if (!$term instanceof WP_Term) return;

        $definitions = Utils::getSettings()->taxonomies->get($term->taxonomy)->getCustomFields();
        if (empty($definitions)) return;

        $raw = isset($_POST['kizlo_custom_fields']) ? json_decode(wp_unslash($_POST['kizlo_custom_fields']), true) : null;
        if (!is_array($raw)) return;

        try {
            CustomFieldsStore::write(CustomFieldsStore::META_TERM, $term_id, $definitions, $raw);
        } catch (InvalidArgumentException $e) {
            CustomFieldsNotice::flash($e->getMessage());
        } catch (Throwable $e) {
            kizlo_log('Term custom fields save failed: ' . $e->getMessage());
        }
    }

    /**
     * @param array<int, array<string, mixed>> $definitions
     * @param array<string, mixed>             $values
     */
    private function inlinePayload(array $definitions, array $values): void
    {
        wp_add_inline_script(
            'kizlo-custom-fields',
            'window.kizloCustomFields = ' . wp_json_encode([
                'definitions' => $definitions,
                'values'      => (object) $values,
            ]) . ';',
            'before'
        );
    }

    /**
     * @return array<int, string>
     */
    private function managedTaxonomies(): array
    {
        return array_keys(Utils::getSettings()->taxonomies->all());
    }
}
