<?php

namespace Kizlo\Modules\Headless;

use Kizlo\Modules\Settings\Headless\HeadlessSettings;

/**
 * First-install experience for Headless Mode: recommends enabling it via a
 * dismissible admin banner. Headless Mode is only ever switched on by an explicit
 * human action (the banner button or the settings screen), never seeded here.
 */
class Onboarding
{
    private const BANNER_FLAG        = 'kizlo_headless_banner';
    private const USER_DISMISS_META  = 'kizlo_headless_banner_dismissed';
    private const NONCE_ACTION       = 'kizlo_headless_banner';

    /**
     * Flag the recommendation banner on install. Headless Mode stays off: enabling
     * it is always a deliberate choice. An install that already has a Headless
     * choice saved is left untouched so re-activation never re-prompts.
     */
    public static function activate(): void
    {
        if (get_option('kizlo_settings_headless', null) === null) {
            update_option(self::BANNER_FLAG, '1');
        }
    }

    public function register(): void
    {
        add_action('admin_notices', [$this, 'maybeRenderBanner']);
        add_action('admin_post_kizlo_enable_headless', [$this, 'enable']);
        add_action('admin_post_kizlo_dismiss_headless_banner', [$this, 'dismiss']);
    }

    /**
     * Every headless toggle switched on, for the explicit opt-in path.
     *
     * @return array<string, bool>
     */
    private static function allFeaturesOn(): array
    {
        return [
            'enabled'             => true,
            'preview'             => true,
            'view_links'          => true,
            'block_indexing'      => true,
            'frontend_lockout'    => true,
            // Redirect mode stays off: hiding with a 404 is the secure default and
            // does not leak the frontend URL.
            'frontend_lockout_redirect' => false,
            'disable_feeds'       => true,
            'disable_embeds'      => true,
            'disable_xmlrpc'      => true,
            'block_enumeration'   => true,
            'clean_head'          => true,
            'disable_file_editor' => true,
            'disable_pingbacks'   => true,
            // Login rename needs a user-chosen slug, so it is not auto-enabled.
            'rename_login'        => false,
        ];
    }

    public function maybeRenderBanner(): void
    {
        if (! current_user_can('manage_options')) {
            return;
        }

        if (get_option(self::BANNER_FLAG) !== '1') {
            return;
        }

        // Nothing to recommend once Headless Mode is already on.
        if (HeadlessSettings::load()->isMasterEnabled()) {
            return;
        }

        if (get_user_meta(get_current_user_id(), self::USER_DISMISS_META, true)) {
            return;
        }

        $enable   = wp_nonce_url(admin_url('admin-post.php?action=kizlo_enable_headless'), self::NONCE_ACTION);
        $dismiss  = wp_nonce_url(admin_url('admin-post.php?action=kizlo_dismiss_headless_banner'), self::NONCE_ACTION);
        $settings = admin_url('admin.php?page=' . KIZLO_SETTINGS_PAGE) . '#/system/headless';
?>
        <div class="notice notice-info">
            <p>
                <strong>Recommended:</strong> Turn on Headless Mode to tighten security and switch off
                the features you don't need in a headless CMS setup. You can fine-tune the experience
                anytime in <a href="<?php echo esc_url($settings); ?>">Headless settings</a>.
            </p>
            <p>
                <a href="<?php echo esc_url($enable); ?>" class="button button-primary">Enable Headless Mode</a>
                <a href="<?php echo esc_url($dismiss); ?>" class="button">Dismiss</a>
            </p>
        </div>
<?php
    }

    public function enable(): void
    {
        if (! current_user_can('manage_options') || ! check_admin_referer(self::NONCE_ACTION)) {
            wp_die('Forbidden', '', ['response' => 403]);
        }

        $this->optIn();

        wp_safe_redirect(wp_get_referer() ?: admin_url());
        exit;
    }

    /**
     * Switch on the full headless experience and mirror blog_public. Split from the
     * request handler so the state change is testable without the redirect/exit.
     */
    public function optIn(): void
    {
        $settings = HeadlessSettings::load();
        $settings->setData(self::allFeaturesOn())->save();

        update_option('blog_public', $settings->isEnabled('block_indexing') ? '0' : '1');

        delete_option(self::BANNER_FLAG);
    }

    public function dismiss(): void
    {
        if (! current_user_can('manage_options') || ! check_admin_referer(self::NONCE_ACTION)) {
            wp_die('Forbidden', '', ['response' => 403]);
        }

        update_user_meta(get_current_user_id(), self::USER_DISMISS_META, '1');

        wp_safe_redirect(wp_get_referer() ?: admin_url());
        exit;
    }
}
