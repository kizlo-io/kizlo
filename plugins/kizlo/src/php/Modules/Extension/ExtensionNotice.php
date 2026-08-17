<?php

namespace Kizlo\Modules\Extension;

/**
 * Says why an extension did not start, on every admin screen until it is fixed.
 *
 * Not dismissible, and not on the Plugins screen alone. A blocked extension
 * leaves the site running with a piece of it missing, which looks like a bug
 * somewhere else entirely, so the explanation has to be where the person
 * looking for it will be.
 */
class ExtensionNotice
{
    public function register(): void
    {
        add_action('admin_notices', [$this, 'render']);
    }

    public function render(): void
    {
        if (!current_user_can('activate_plugins')) return;

        foreach (Extensions::blocked() as $extension) {
            $reasons = '';

            foreach ($extension['unmet'] as $requirement) {
                $reasons .= '<li>' . esc_html($requirement->describe()) . '</li>';
            }

            printf(
                '<div class="notice notice-error"><p><strong>%s</strong> %s</p><ul style="list-style:disc;margin-left:2em">%s</ul></div>',
                esc_html($extension['name']),
                esc_html('did not start, because Kizlo cannot support it at the versions installed:'),
                $reasons
            );
        }
    }
}
