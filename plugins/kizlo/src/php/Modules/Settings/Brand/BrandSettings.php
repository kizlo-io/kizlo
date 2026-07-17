<?php

namespace Kizlo\Modules\Settings\Brand;

use Kizlo\Modules\Settings\SettingsAbstract;

/**
 * Manages brand asset settings stored under a single WordPress option.
 *
 * Covers the logo variants, favicon, and app icons rendered by the headless
 * frontend. Logos come in light/dark pairs so the frontend can swap them by
 * color scheme; the favicon is a single scheme-agnostic icon, since browsers
 * disagree on swapping favicons by scheme. Each media field is stored as an
 * attachment ID.
 *
 * @since 1.0.0
 */
class BrandSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_brand';

    protected array $data = [
        'logo'               => null,
        'logo_dark'          => null,
        'logo_icon'          => null,
        'logo_icon_dark'     => null,
        'logo_wordmark'      => null,
        'logo_wordmark_dark' => null,
        'favicon'            => null,
        'app_icon'           => null,
        'theme_color'            => null,
        'theme_color_dark'       => null,
        'background_color'       => null,
    ];

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'logo',
            'logo_dark',
            'logo_icon',
            'logo_icon_dark',
            'logo_wordmark',
            'logo_wordmark_dark',
            'favicon',
            'app_icon'           => !empty($value) ? absint($value) : null,

            'theme_color',
            'theme_color_dark',
            'background_color'   => !empty($value) ? sanitize_hex_color($value) : null,

            default              => $value,
        };
    }

    protected function validate(string $key, mixed $value): void
    {
        match ($key) {
            'logo',
            'logo_dark',
            'logo_icon',
            'logo_icon_dark',
            'logo_wordmark',
            'logo_wordmark_dark',
            'favicon',
            'app_icon'           => $this->assertValidMediaId($key, $value),

            'theme_color',
            'theme_color_dark',
            'background_color'   => $this->assertValidHexColor($key, $value),
            default              => null,
        };
    }

    // ============================================
    // GETTERS & SETTERS
    // ============================================

    /**
     * WordPress media attachment ID for the primary (light-scheme) logo.
     */
    public function getLogo(): ?int
    {
        return $this->get('logo');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setLogo(?int $value): static
    {
        $this->set('logo', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID for the dark-scheme logo variant.
     */
    public function getLogoDark(): ?int
    {
        return $this->get('logo_dark');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setLogoDark(?int $value): static
    {
        $this->set('logo_dark', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID for the square icon (light-scheme).
     */
    public function getLogoIcon(): ?int
    {
        return $this->get('logo_icon');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setLogoIcon(?int $value): static
    {
        $this->set('logo_icon', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID for the dark-scheme square icon variant.
     */
    public function getLogoIconDark(): ?int
    {
        return $this->get('logo_icon_dark');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setLogoIconDark(?int $value): static
    {
        $this->set('logo_icon_dark', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID for the wordmark (light-scheme).
     */
    public function getLogoWordmark(): ?int
    {
        return $this->get('logo_wordmark');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setLogoWordmark(?int $value): static
    {
        $this->set('logo_wordmark', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID for the dark-scheme wordmark variant.
     */
    public function getLogoWordmarkDark(): ?int
    {
        return $this->get('logo_wordmark_dark');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setLogoWordmarkDark(?int $value): static
    {
        $this->set('logo_wordmark_dark', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID for the favicon. A single scheme-agnostic
     * icon; browsers disagree on swapping favicons by color scheme.
     */
    public function getFavicon(): ?int
    {
        return $this->get('favicon');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setFavicon(?int $value): static
    {
        $this->set('favicon', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID for the app icon. A single square icon used
     * for the Apple touch icon and the web-manifest icon, so every home-screen
     * and install surface renders the same mark.
     */
    public function getAppIcon(): ?int
    {
        return $this->get('app_icon');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setAppIcon(?int $value): static
    {
        $this->set('app_icon', $value);
        return $this;
    }

    /**
     * Brand theme color (hex), light scheme. Feeds the web-manifest `theme_color`
     * and the light `<meta name="theme-color">`.
     */
    public function getThemeColor(): ?string
    {
        return $this->get('theme_color');
    }

    /** @param string|null $value Hex color or null to clear. */
    public function setThemeColor(?string $value): static
    {
        $this->set('theme_color', $value);
        return $this;
    }

    /**
     * Brand theme color (hex), dark scheme. Feeds the dark-scheme
     * `<meta name="theme-color">` variant.
     */
    public function getThemeColorDark(): ?string
    {
        return $this->get('theme_color_dark');
    }

    /** @param string|null $value Hex color or null to clear. */
    public function setThemeColorDark(?string $value): static
    {
        $this->set('theme_color_dark', $value);
        return $this;
    }

    /**
     * Brand background color (hex), light scheme. Feeds the web-manifest
     * `background_color` (the install/splash surface).
     */
    public function getBackgroundColor(): ?string
    {
        return $this->get('background_color');
    }

    /** @param string|null $value Hex color or null to clear. */
    public function setBackgroundColor(?string $value): static
    {
        $this->set('background_color', $value);
        return $this;
    }
}
