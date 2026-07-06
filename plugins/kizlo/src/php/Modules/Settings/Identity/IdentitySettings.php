<?php

namespace Kizlo\Modules\Settings\Identity;

use Kizlo\Modules\Settings\SettingsAbstract;

class IdentitySettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_identity';

    public PersonSettings $person;
    public OrganizationSettings $organization;
    protected const IDENTITY_TYPE_PERSON = 'person';
    protected const IDENTITY_TYPE_ORGANIZATION = 'organization';
    protected const IDENTITY_TYPE_DEFAULT = 'organization';
    protected const IDENTITY_TYPES = [self::IDENTITY_TYPE_PERSON, self::IDENTITY_TYPE_ORGANIZATION];

    protected array $data = [
        'type' => self::IDENTITY_TYPE_DEFAULT,
    ];

    public function __construct(array $data)
    {
        parent::__construct(['type' => $data['type'] ?? self::IDENTITY_TYPE_DEFAULT]);
        $this->person       = new PersonSettings($data['person'] ?? []);
        $this->organization = new OrganizationSettings($data['organization'] ?? []);
    }
    public static function load(): static
    {
        $instance               = parent::load();
        $instance->person       = PersonSettings::load();
        $instance->organization = OrganizationSettings::load();
        return $instance;
    }

    /**
     * The active identity type, either 'person' or 'organization'.
     */
    public function getType(): string
    {
        return $this->get('type') ?? self::IDENTITY_TYPE_DEFAULT;
    }

    /** @param string $value Either 'person' or 'organization'. */
    public function setType(string $value): static
    {
        $this->set('type', $value);
        return $this;
    }

    public function isPerson(): bool
    {
        return $this->getType() === self::IDENTITY_TYPE_PERSON;
    }

    public function isOrganization(): bool
    {
        return $this->getType() === self::IDENTITY_TYPE_ORGANIZATION;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'type'  => in_array($value, self::IDENTITY_TYPES, true) ? $value : self::IDENTITY_TYPE_DEFAULT,
            default => $value,
        };
    }

    protected function validate(string $key, mixed $value): void
    {
        match ($key) {
            'type'  => $this->assertValidType($value),
            default => null,
        };
    }

    /**
     * Assert identity type is either 'person' or 'organization'.
     *
     * @throws \InvalidArgumentException
     */
    private function assertValidType(mixed $value): void
    {
        if (!in_array($value, self::IDENTITY_TYPES, true)) {
            throw new \InvalidArgumentException('type must be either "person" or "organization".');
        }
    }
}
