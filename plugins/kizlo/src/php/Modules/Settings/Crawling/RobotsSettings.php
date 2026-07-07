<?php

namespace Kizlo\Modules\Settings\Crawling;

use Kizlo\Modules\Settings\SettingsAbstract;

class RobotsSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_robots';

    protected array $data = [
        'include_sitemap' => true,
        'custom_rules'    => [],
    ];

    /**
     * Whether to include the sitemap URL in robots.txt output.
     * Defaults to true.
     */
    public function getIncludeSitemap(): bool
    {
        return (bool) $this->get('include_sitemap');
    }

    /** @param bool $value */
    public function setIncludeSitemap(bool $value): static
    {
        $this->set('include_sitemap', $value);
        return $this;
    }

    /**
     * Custom robots.txt directives for advanced use. Each entry is a single
     * allow/disallow directive; `SeoBase::robots()` groups them by user agent
     * into the emitted `{user_agent, allow[], disallow[]}` shape.
     *
     * @return array<int, array{user_agent: string, rule: string, path: string}>
     */
    public function getCustomRules(): array
    {
        return $this->get('custom_rules') ?? [];
    }

    /**
     * @param array<int, array{user_agent: string, rule: string, path: string}> $value
     */
    public function setCustomRules(array $value): static
    {
        $this->set('custom_rules', $value);
        return $this;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'include_sitemap' => (bool) $value,
            'custom_rules'    => $this->sanitizeCustomRules($value),
            default           => $value,
        };
    }

    private function sanitizeCustomRules(mixed $value): array
    {
        if (empty($value) || !is_array($value)) return [];

        return array_map(fn($rule) => [
            'user_agent' => sanitize_text_field($rule['user_agent'] ?? '*'),
            'rule'       => in_array($rule['rule'] ?? '', ['allow', 'disallow'], true) ? $rule['rule'] : 'disallow',
            'path'       => sanitize_text_field($rule['path'] ?? '/'),
        ], $value);
    }
}
