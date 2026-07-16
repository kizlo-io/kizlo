<?php

namespace Kizlo\Modules\Settings\Webhook;

use Kizlo\Modules\Settings\SettingsAbstract;

class WebhookSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_webhook';

    protected array $data = [
        'post_types'   => ['allow' => [], 'deny' => []],
        'taxonomies'   => ['allow' => [], 'deny' => []],
        'webhook_urls' => [],
    ];

    /**
     * Default watched post types. Integrations extend via the filter.
     *
     * @return string[]
     */
    public static function getDefaultPostTypes(): array
    {
        return apply_filters('kizlo_default_watched_post_types', ['post', 'page']);
    }

    /**
     * Default watched taxonomies. Integrations extend via the filter.
     *
     * @return string[]
     */
    public static function getDefaultTaxonomies(): array
    {
        return apply_filters('kizlo_default_watched_taxonomies', ['category', 'post_tag']);
    }

    /**
     * Effective post type slugs that trigger webhook events.
     *
     * @return string[]
     */
    public function getPostTypes(): array
    {
        return $this->resolve($this->get('post_types'), self::getDefaultPostTypes());
    }

    /** @param string[] $value Flat list of checked slugs. */
    public function setPostTypes(array $value): static
    {
        $this->set('post_types', $value);
        return $this;
    }

    /**
     * Effective taxonomy slugs that trigger webhook events.
     *
     * @return string[]
     */
    public function getTaxonomies(): array
    {
        return $this->resolve($this->get('taxonomies'), self::getDefaultTaxonomies());
    }

    /** @param string[] $value Flat list of checked slugs. */
    public function setTaxonomies(array $value): static
    {
        $this->set('taxonomies', $value);
        return $this;
    }

    /**
     * List of URLs that receive webhook payloads.
     *
     * @return string[]
     */
    public function getWebhookUrls(): array
    {
        return $this->get('webhook_urls') ?? [];
    }

    /** @param string[] $value List of valid URLs. */
    public function setWebhookUrls(array $value): static
    {
        $this->set('webhook_urls', $value);
        return $this;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'post_types'   => $this->toDelta(array_map('sanitize_key', (array) $value), self::getDefaultPostTypes()),
            'taxonomies'   => $this->toDelta(array_map('sanitize_key', (array) $value), self::getDefaultTaxonomies()),
            'webhook_urls' => array_map('esc_url_raw', (array) $value),
            default        => $value,
        };
    }

    protected function validate(string $key, mixed $value): void
    {
        match ($key) {
            'webhook_urls' => $this->assertValidWebhookUrls($value),
            default        => null,
        };
    }

    /**
     * Resolve a stored allow/deny delta against the live defaults.
     *
     * @param  mixed    $stored   Stored delta: array{allow: string[], deny: string[]}.
     * @param  string[] $defaults Current default slugs.
     * @return string[]
     */
    private function resolve(mixed $stored, array $defaults): array
    {
        $allow = is_array($stored) && is_array($stored['allow'] ?? null) ? $stored['allow'] : [];
        $deny  = is_array($stored) && is_array($stored['deny'] ?? null) ? $stored['deny'] : [];

        return array_values(array_diff(array_unique(array_merge($defaults, $allow)), $deny));
    }

    /**
     * Convert a flat list of checked slugs into an allow/deny delta vs. defaults.
     *
     * @param  string[] $checked
     * @param  string[] $defaults
     * @return array{allow: string[], deny: string[]}
     */
    private function toDelta(array $checked, array $defaults): array
    {
        return [
            'allow' => array_values(array_diff($checked, $defaults)),
            'deny'  => array_values(array_diff($defaults, $checked)),
        ];
    }

    /**
     * Assert each webhook URL is a valid URL.
     *
     * @param  mixed $value
     * @throws \InvalidArgumentException
     */
    private function assertValidWebhookUrls(mixed $value): void
    {
        if (empty($value) || !is_array($value)) return;

        foreach ($value as $i => $url) {
            if (!filter_var($url, FILTER_VALIDATE_URL)) {
                throw new \InvalidArgumentException(
                    "webhook_urls[{$i}] must be a valid URL."
                );
            }
        }
    }
}
