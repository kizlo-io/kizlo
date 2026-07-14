<?php

namespace Kizlo\Modules\Settings\Brand;

use Kizlo\Modules\Settings\SettingsAbstract;

/**
 * Manages brand asset settings stored under a single WordPress option.
 *
 * Covers the logo variants, favicons, and app icon rendered by the headless
 * frontend. Favicons and logos come in light/dark pairs so the frontend can
 * swap them by color scheme; the base variant is the fallback and the dark
 * variant is optional. Each media field is stored as an attachment ID.
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
        'favicon_dark'       => null,
        'apple_touch_icon'   => null,
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
            'favicon_dark',
            'apple_touch_icon'   => !empty($value) ? absint($value) : null,

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
            'favicon_dark',
            'apple_touch_icon'   => $this->assertValidMediaId($key, $value),
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
     * WordPress media attachment ID for the default (light-scheme) favicon.
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
     * WordPress media attachment ID for the dark-scheme favicon variant.
     */
    public function getFaviconDark(): ?int
    {
        return $this->get('favicon_dark');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setFaviconDark(?int $value): static
    {
        $this->set('favicon_dark', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID for the iOS home-screen (Apple touch) icon.
     */
    public function getAppleTouchIcon(): ?int
    {
        return $this->get('apple_touch_icon');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setAppleTouchIcon(?int $value): static
    {
        $this->set('apple_touch_icon', $value);
        return $this;
    }
}
