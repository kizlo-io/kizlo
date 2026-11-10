<?php

namespace Kizlo\Pos\Modules\Settings;

/** Shared tab: integrations add sections and fields through WooCommerce's native filters. */
final class SettingsPage extends \WC_Settings_Page
{
    public function __construct()
    {
        $this->id = 'kizlo';
        $this->label = __('Kizlo', 'kizlo-pos');
        parent::__construct();
    }

    protected function get_own_sections(): array
    {
        return [];
    }

    public function output_sections(): void
    {
        global $current_section;
        $sections = $this->get_sections();
        $selected = $current_section ?: array_key_first($sections);
        // WooCommerce hides navigation when only one section exists; keep POS discoverable.
        echo '<ul class="subsubsub">';
        foreach ($sections as $id => $label) {
            $url = add_query_arg(['page' => 'wc-settings', 'tab' => 'kizlo', 'section' => $id], admin_url('admin.php'));
            echo '<li><a href="' . esc_url($url) . '"' . ($selected === $id ? ' class="current" aria-current="page"' : '') . '>' . esc_html($label) . '</a>';
            if ($id !== array_key_last($sections)) echo ' | ';
            echo '</li>';
        }
        echo '</ul><br class="clear" />';
    }
}
