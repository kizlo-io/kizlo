<?php

namespace Kizlo\Modules\CustomFields;

/**
 * Flash admin notice used when a classic-form custom-fields save is rejected.
 *
 * The post metabox and taxonomy forms submit through the classic form (not REST),
 * so a validation failure can't be returned inline. Instead the message is stashed
 * per-user for one request and rendered on the next admin page load.
 */
class CustomFieldsNotice
{
    private const PREFIX = 'kizlo_cf_error_';

    public function register(): void
    {
        add_action('admin_notices', [$this, 'render']);
    }

    public static function flash(string $message): void
    {
        set_transient(self::PREFIX . get_current_user_id(), $message, 60);
    }

    public function render(): void
    {
        $key     = self::PREFIX . get_current_user_id();
        $message = get_transient($key);
        if (!$message) return;

        delete_transient($key);

        printf('<div class="notice notice-error is-dismissible"><p>%s</p></div>', esc_html('Custom fields not saved: ' . $message));
    }
}
