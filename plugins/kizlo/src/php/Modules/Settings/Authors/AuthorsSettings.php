<?php

namespace Kizlo\Modules\Settings\Authors;

use Kizlo\Modules\Settings\SettingsAbstract;
use Kizlo\Modules\Settings\HasBreadcrumbsSetting;

class AuthorsSettings extends SettingsAbstract
{
    use HasBreadcrumbsSetting;

    protected const OPTION_KEY = 'kizlo_settings_authors';

    protected array $data = [
        'pathname_structure'       => null,
        'enabled'                  => false,
        'title_structure'          => null,
        'description_structure'    => null,
        'search_engine_visibility' => true,
        'breadcrumbs'              => [],
    ];

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'pathname_structure',
            'title_structure',
            'description_structure'    => !empty($value) ? sanitize_text_field($value) : null,
            'enabled',
            'search_engine_visibility' => (bool) $value,
            'breadcrumbs'              => $this->sanitizeBreadcrumbs($value),
            default                    => $value,
        };
    }

    /**
     * The URL pathname structure for author archives, supporting variable placeholders (e.g. /authors/{{slug}}).
     */
    public function getPathnameStructure(): ?string
    {
        return $this->get('pathname_structure');
    }

    /** @param string|null $value Pathname structure or null to clear. */
    public function setPathnameStructure(?string $value): static
    {
        $this->set('pathname_structure', $value);
        return $this;
    }

    /**
     * Whether author archive pages are enabled on this site.
     */
    public function getEnabled(): bool
    {
        return (bool) $this->get('enabled');
    }

    /** @param bool $value True to enable author archives, false to disable. */
    public function setEnabled(bool $value): static
    {
        $this->set('enabled', $value);
        return $this;
    }

    /**
     * The SEO title structure for author archive pages, supporting variable placeholders.
     */
    public function getTitleStructure(): ?string
    {
        return $this->get('title_structure');
    }

    /** @param string|null $value Title structure or null to clear. */
    public function setTitleStructure(?string $value): static
    {
        $this->set('title_structure', $value);
        return $this;
    }

    /**
     * The SEO description structure for author archive pages, supporting variable placeholders.
     */
    public function getDescriptionStructure(): ?string
    {
        return $this->get('description_structure');
    }

    /** @param string|null $value Description structure or null to clear. */
    public function setDescriptionStructure(?string $value): static
    {
        $this->set('description_structure', $value);
        return $this;
    }

    /**
     * Whether author archive pages are visible to search engines.
     * Defaults to true.
     */
    public function getSearchEngineVisibility(): bool
    {
        return (bool) $this->get('search_engine_visibility');
    }

    /** @param bool $value True to allow indexing, false to block. */
    public function setSearchEngineVisibility(bool $value): static
    {
        $this->set('search_engine_visibility', $value);
        return $this;
    }
}
