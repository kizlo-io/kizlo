<?php

namespace Kizlo\Modules\Settings\Site;

use InvalidArgumentException;
use Kizlo\Modules\Settings\SettingsAbstract;

/**
 * Manages site-level settings stored under a single WordPress option.
 *
 * Covers site identity, branding, fallback image, and search action configuration.
 * Each property is validated and sanitized on set.
 *
 * @since 1.0.0
 */
class SiteSettings extends SettingsAbstract
{
    public const DEFAULT_TITLE_SEPARATOR = "|";
    protected const OPTION_KEY = 'kizlo_settings_site';
    public const TITLE_SEPARATORS = ["-", "—", ":", "·", "•", "*", "⋆", "|", "~", "«", "»", ">", "<"];

    protected array $data = [
        'url'                     => null,
        'secret'                  => null,
        'name'                    => null,
        'alternate_name'          => null,
        'tagline'                 => null,
        'title_separator'         => '|',
        'fallback_image'          => null,
        'search_action_structure' => null,
    ];

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'url',
            'name',
            'secret',
            'tagline',
            'alternate_name',
            'search_action_structure' => !empty($value) ? sanitize_text_field($value) : null,

            'title_separator'         => !empty($value) ? $value : static::DEFAULT_TITLE_SEPARATOR,

            'fallback_image'          => !empty($value) ? absint($value) : null,
            default                   => $value,
        };
    }

    protected function validate(string $key, mixed $value): void
    {
        match ($key) {
            'url'             => $this->assertValidUrl($key, $value),
            'fallback_image'  => $this->assertValidMediaId($key, $value),
            'title_separator' => ! in_array($value, static::TITLE_SEPARATORS, true) ? throw new InvalidArgumentException('Invalid title separator.') : null,
            default           => null,
        };
    }

    // ============================================
    // GETTERS & SETTERS
    // ============================================

    /**
     * The canonical URL of the site (e.g. https://example.com).
     */
    public function getUrl(): ?string
    {
        return $this->get('url');
    }

    /**
     * @param string|null $value Valid URL or null to clear.
     */
    public function setUrl(?string $value): static
    {
        $this->set('url', $value);
        return $this;
    }

    /**
     * The secret for hashing and sending webhook events to kizlo.
     */
    public function getSecret(): ?string
    {
        return $this->get('secret');
    }

    /** 
     * @param string|null $value secret. 
     */
    public function setSecret(?string $value): static
    {
        $this->set('secret', $value);
        return $this;
    }

    /**
     * The primary name of the site.
     */
    public function getName(): ?string
    {
        return $this->get('name');
    }

    /**
     * @param string|null $value Site name or null to clear.
     */
    public function setName(?string $value): static
    {
        $this->set('name', $value);
        return $this;
    }

    /**
     * An alternate or secondary name for the site.
     */
    public function getAlternateName(): ?string
    {
        return $this->get('alternate_name');
    }

    /**
     * @param string|null $value Alternate name or null to clear.
     */
    public function setAlternateName(?string $value): static
    {
        $this->set('alternate_name', $value);
        return $this;
    }

    /**
     * A short tagline or slogan describing the site.
     */
    public function getTagline(): ?string
    {
        return $this->get('tagline');
    }

    /**
     * @param string|null $value Tagline or null to clear.
     */
    public function setTagline(?string $value): static
    {
        $this->set('tagline', $value);
        return $this;
    }

    /**
     * Character used to separate title segments (e.g. '-', '|', '·').
     * Defaults to '-'.
     */
    public function getTitleSeparator(): string
    {
        return $this->get('title_separator') ?? '-';
    }

    /**
     * @param string|null $value Separator character or null to reset to default.
     */
    public function setTitleSeparator(?string $value): static
    {
        $this->set('title_separator', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID used as the site-wide fallback image.
     */
    public function getFallbackImage(): ?int
    {
        return $this->get('fallback_image');
    }

    /**
     * @param int|null $value Attachment ID or null to clear.
     */
    public function setFallbackImage(?int $value): static
    {
        $this->set('fallback_image', $value);
        return $this;
    }

    /**
     * The search action structure template containing {search_term_string} placeholder.
     */
    public function getSearchActionStructure(): ?string
    {
        return $this->get('search_action_structure');
    }

    /**
     * @param string|null $value Structure template or null to clear.
     */
    public function setSearchActionStructure(?string $value): static
    {
        $this->set('search_action_structure', $value);
        return $this;
    }
}
