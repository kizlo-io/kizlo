<?php

namespace Kizlo\Modules\Settings\Identity;

use Kizlo\Modules\Settings\SettingsAbstract;

class OrganizationSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_identity_organization';

    protected array $data = [
        'name'            => null,
        'alternate_name'  => null,
        'slogan'          => null,
        'description'     => null,
        'email'           => null,
        'phone'           => null,
        'legal_name'      => null,
        'founding_date'   => null,
        'founder'         => null,
        'employees_min'   => null,
        'employees_max'   => null,
        'logo'            => null,
        'social_profiles' => [],

        'vat_id'          => null,
        'tax_id'          => null,
        'iso6523_code'    => null,
        'duns'            => null,
        'lei_code'        => null,
        'naics'           => null,

        'publishing_principles'      => null,
        'ownership_funding_info'     => null,
        'actionable_feedback_policy' => null,
        'corrections_policy'         => null,
        'ethics_policy'              => null,
        'diversity_policy'           => null,
        'diversity_staffing_report'  => null,
    ];

    /**
     * The official name of the organization.
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
     * An alternate or secondary name for the organization.
     */
    public function getAlternateName(): ?string
    {
        return $this->get('alternate_name');
    }

    /** @param string|null $value */
    public function setAlternateName(?string $value): static
    {
        $this->set('alternate_name', $value);
        return $this;
    }

    /**
     * A short slogan or tagline for the organization.
     */
    public function getSlogan(): ?string
    {
        return $this->get('slogan');
    }

    /** @param string|null $value */
    public function setSlogan(?string $value): static
    {
        $this->set('slogan', $value);
        return $this;
    }

    /**
     * A brief description of the organization.
     */
    public function getDescription(): ?string
    {
        return $this->get('description');
    }

    /** @param string|null $value */
    public function setDescription(?string $value): static
    {
        $this->set('description', $value);
        return $this;
    }

    /**
     * The organization's contact email address.
     */
    public function getEmail(): ?string
    {
        return $this->get('email');
    }

    /** @param string|null $value */
    public function setEmail(?string $value): static
    {
        $this->set('email', $value);
        return $this;
    }

    /**
     * The organization's contact phone number.
     */
    public function getPhone(): ?string
    {
        return $this->get('phone');
    }

    /** @param string|null $value */
    public function setPhone(?string $value): static
    {
        $this->set('phone', $value);
        return $this;
    }

    /**
     * The registered legal name of the organization.
     */
    public function getLegalName(): ?string
    {
        return $this->get('legal_name');
    }

    /** @param string|null $value */
    public function setLegalName(?string $value): static
    {
        $this->set('legal_name', $value);
        return $this;
    }

    /**
     * The date the organization was founded (YYYY-MM-DD).
     */
    public function getFoundingDate(): ?string
    {
        return $this->get('founding_date');
    }

    /** @param string|null $value Date in YYYY-MM-DD format or null to clear. */
    public function setFoundingDate(?string $value): static
    {
        $this->set('founding_date', $value);
        return $this;
    }

    /**
     * The founder of the organization as an array with name and social profiles.
     *
     * @return array{name: string, social_profiles: array}|null
     */
    public function getFounder(): ?array
    {
        return $this->get('founder');
    }

    /**
     * @param array{name: string, social_profiles: array}|null $value
     */
    public function setFounder(?array $value): static
    {
        $this->set('founder', $value);
        return $this;
    }

    /**
     * Lower bound of the employee-count range (schema.org QuantitativeValue).
     */
    public function getEmployeesMin(): ?int
    {
        return $this->get('employees_min');
    }

    /**
     * Upper bound of the employee-count range (schema.org QuantitativeValue).
     */
    public function getEmployeesMax(): ?int
    {
        return $this->get('employees_max');
    }

    /**
     * WordPress media attachment ID for the organization's logo.
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
            'name',
            'alternate_name',
            'slogan',
            'phone',
            'legal_name',
            'vat_id',
            'tax_id',
            'iso6523_code',
            'duns',
            'lei_code',
            'naics'           => !empty($value) ? sanitize_text_field($value) : null,
            'description'     => !empty($value) ? sanitize_textarea_field($value) : null,
            'email'           => !empty($value) ? sanitize_email($value) : null,
            'founding_date'   => !empty($value) ? sanitize_text_field($value) : null,
            'founder'         => $this->sanitizeFounder($value),
            'employees_min',
            'employees_max'   => !empty($value) ? absint($value) : null,
            'logo'            => !empty($value) ? absint($value) : null,
            'social_profiles' => $this->sanitizeSocialProfiles($value),
            'publishing_principles',
            'ownership_funding_info',
            'actionable_feedback_policy',
            'corrections_policy',
            'ethics_policy',
            'diversity_policy',
            'diversity_staffing_report' => !empty($value) ? esc_url_raw($value) : null,
            default           => $value,
        };
    }

    protected function validate(string $key, mixed $value): void
    {
        match ($key) {
            'email'           => $this->assertValidEmail($value),
            'founding_date'   => $this->assertValidDate($value),
            'employees_min',
            'employees_max'   => $this->assertPositiveInt($value),
            'social_profiles' => $this->assertValidSocialProfiles($value),
            'founder'         => $this->assertValidFounder($value),
            'publishing_principles',
            'ownership_funding_info',
            'actionable_feedback_policy',
            'corrections_policy',
            'ethics_policy',
            'diversity_policy',
            'diversity_staffing_report' => $this->assertValidUrl($key, $value),
            default           => null,
        };
    }

    /**
     * Sanitize founder array.
     *
     * @param  mixed $value
     * @return array{name: string, social_profiles: array}|null
     */
    private function sanitizeFounder(mixed $value): ?array
    {
        if (empty($value) || !is_array($value)) return null;

        return [
            'name'            => sanitize_text_field($value['name'] ?? ''),
            'social_profiles' => $this->sanitizeSocialProfiles($value['social_profiles'] ?? []),
        ];
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
     * Assert value is a valid email address.
     *
     * @throws \InvalidArgumentException
     */
    private function assertValidEmail(mixed $value): void
    {
        if (!empty($value) && !is_email($value)) {
            throw new \InvalidArgumentException('email must be a valid email address.');
        }
    }

    /**
     * Assert value is a valid date in YYYY-MM-DD format.
     *
     * @throws \InvalidArgumentException
     */
    private function assertValidDate(mixed $value): void
    {
        if (empty($value)) return;

        $d = \DateTime::createFromFormat('Y-m-d', $value);
        if (!$d || $d->format('Y-m-d') !== $value) {
            throw new \InvalidArgumentException('founding_date must be a valid date in YYYY-MM-DD format.');
        }
    }

    /**
     * Assert value is a positive integer.
     *
     * @throws \InvalidArgumentException
     */
    private function assertPositiveInt(mixed $value): void
    {
        if (!empty($value) && (!is_numeric($value) || (int) $value < 0)) {
            throw new \InvalidArgumentException('employees must be a positive integer.');
        }
    }

    /**
     * Assert each social profile has a valid URL.
     *
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

    /**
     * Assert founder has a name if provided.
     *
     * @throws \InvalidArgumentException
     */
    private function assertValidFounder(mixed $value): void
    {
        if (empty($value)) return;

        if (empty($value['name'])) {
            throw new \InvalidArgumentException('founder.name is required.');
        }

        $this->assertValidSocialProfiles($value['social_profiles'] ?? []);
    }
}
