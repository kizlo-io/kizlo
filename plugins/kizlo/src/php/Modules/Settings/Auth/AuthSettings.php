<?php

namespace Kizlo\Modules\Settings\Auth;

use Kizlo\Modules\Auth\AuthConfiguration;
use Kizlo\Modules\Settings\SettingsAbstract;

final class AuthSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_auth';

    /** @param array<string, mixed> $data */
    public function __construct(array $data = [])
    {
        $this->data = AuthConfiguration::defaults();
        parent::__construct($data);
    }

    public function save(): bool
    {
        $this->data = AuthConfiguration::normalize($this->data);
        return parent::save();
    }
}
