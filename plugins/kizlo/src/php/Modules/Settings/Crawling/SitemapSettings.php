<?php

namespace Kizlo\Modules\Settings\Crawling;

use Kizlo\Modules\Settings\SettingsAbstract;

class SitemapSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_sitemap';

    protected array $data = [
        'pathname_structure' => null,
    ];

    /**
     * The pathname structure for the sitemap index (e.g. /sitemap_index.xml).
     * Defaults to /sitemap_index.xml if not set.
     */
    public function getPathnameStructure(): string
    {
        return $this->get('pathname_structure') ?? '/sitemap_index.xml';
    }

    /** @param string|null $value Pathname or null to reset to default. */
    public function setPathnameStructure(?string $value): static
    {
        $this->set('pathname_structure', $value);
        return $this;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'pathname_structure' => !empty($value) ? sanitize_text_field($value) : null,
            default              => $value,
        };
    }
}
