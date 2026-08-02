<?php

namespace Kizlo\Modules\Settings\Headless;

use Kizlo\Modules\Settings\SettingsAbstract;

/**
 * Headless Mode toggles, stored under a single WordPress option.
 *
 * `enabled` is the master switch; every other field is a child surface that only
 * takes effect while the master is on. Reads should go through isEnabled() so a
 * disabled parent makes WordPress behave 100% natively.
 */
class HeadlessSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_headless';

    /**
     * Slugs that would collide with core routes and must never be used for the
     * renamed login. Compared after sanitize_title(), so values are in their
     * normalised form (e.g. "wp-login.php" normalises to "wp-login-php").
     */
    private const RESERVED_LOGIN_SLUGS = ['wp-login', 'wp-login-php', 'wp-admin', 'admin', 'login', 'wp-register', 'register'];

    protected array $data = [
        'enabled'             => false,
        'preview'             => true,
        'view_links'          => true,
        'block_indexing'      => true,
        'frontend_lockout'    => false,
        'frontend_lockout_redirect' => false,
        'disable_feeds'       => false,
        'disable_embeds'      => false,
        'disable_xmlrpc'      => false,
        'block_enumeration'   => false,
        'clean_head'          => false,
        'disable_file_editor' => false,
        'disable_pingbacks'   => false,
        'rename_login'        => false,
        'login_slug'          => null,
    ];

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'login_slug' => $this->sanitizeLoginSlug($value),
            default      => (bool) $value,
        };
    }

    private function sanitizeLoginSlug(mixed $value): ?string
    {
        $slug = sanitize_title((string) $value);

        if ($slug === '' || in_array($slug, self::RESERVED_LOGIN_SLUGS, true)) {
            return null;
        }

        return $slug;
    }

    /**
     * Whether the master switch is on.
     */
    public function isMasterEnabled(): bool
    {
        return (bool) $this->get('enabled');
    }

    /**
     * Whether a given child surface is active. A surface is only active when the
     * master switch is on and the child toggle itself is on, so callers read a
     * single method regardless of the parent state.
     */
    public function isEnabled(string $feature): bool
    {
        return $this->isMasterEnabled() && (bool) $this->get($feature);
    }

    /**
     * The secret login slug, or null when unset.
     */
    public function getLoginSlug(): ?string
    {
        return $this->get('login_slug');
    }

    /**
     * Whether login renaming should take effect: the master switch and the
     * rename toggle are on and a valid slug is set, so a half-configured feature
     * never hides the login screen away.
     */
    public function isLoginRenameActive(): bool
    {
        return $this->isEnabled('rename_login') && ! empty($this->getLoginSlug());
    }
}
