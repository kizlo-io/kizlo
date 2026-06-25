<?php

namespace Kizlo\Modules\Settings\Identity;

use Kizlo\Modules\Settings\SettingsAbstract;

class PersonSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_identity_person';

    protected array $data = [
        'name'            => null,
        'image'           => null,
        'social_profiles' => [],
    ];

    /**
     * The full name of the person.
     */
    public function getName(): ?string
    {
        return $this->get('name');
    }

    /** @param string|null $value */
    public function setName(?string $value): static
    {
        $this->set('name', $value);
        return $this;
    }

    /**
     * WordPress media attachment ID for the person's profile image.
     */
    public function getImage(): ?int
    {
        return $this->get('image');
    }

    /** @param int|null $value Attachment ID or null to clear. */
    public function setImage(?int $value): static
    {
        $this->set('image', $value);
        return $this;
    }

    /**
     * List of social profile entries, each with a platform and URL.
     *
     * @return array<int, array{platform: string, url: string}>
     */
    public function getSocialProfiles(): array
    {
        return $this->get('social_profiles') ?? [];
    }

    /**
     * @param array<int, array{platform: string, url: string}> $value
     */
    public function setSocialProfiles(array $value): static
    {
        $this->set('social_profiles', $value);
        return $this;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'name'            => !empty($value) ? sanitize_text_field($value) : null,
            'image'           => !empty($value) ? absint($value) : null,
            'social_profiles' => $this->sanitizeSocialProfiles($value),
            default           => $value,
        };
    }

    protected function validate(string $key, mixed $value): void
    {
        match ($key) {
            'social_profiles' => $this->assertValidSocialProfiles($value),
            default           => null,
        };
    }

    /**
     * Sanitize a list of social profiles.
     *
     * @param  mixed $value
     * @return array<int, array{platform: string, url: string}>
     */
    private function sanitizeSocialProfiles(mixed $value): array
    {
        if (empty($value) || !is_array($value)) return [];

        return array_map(fn($profile) => [
            'platform' => sanitize_key($profile['platform'] ?? ''),
            'url'      => esc_url_raw($profile['url'] ?? ''),
        ], $value);
    }

    /**
     * Assert each social profile has a valid URL.
     *
     * @param  mixed $value
     * @throws \InvalidArgumentException
     */
    private function assertValidSocialProfiles(mixed $value): void
    {
        if (empty($value) || !is_array($value)) return;

        foreach ($value as $profile) {
            if (!filter_var($profile['url'] ?? '', FILTER_VALIDATE_URL)) {
                throw new \InvalidArgumentException(
                    "social_profiles.{$profile['platform']} must be a valid URL."
                );
            }
        }
    }
}
