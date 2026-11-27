<?php

namespace Kizlo\Modules\Settings\Captcha;

use InvalidArgumentException;
use Kizlo\Modules\Settings\SettingsAbstract;

final class CaptchaSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_captcha';
    public const PROVIDERS = ['disabled', 'recaptcha', 'turnstile', 'hcaptcha', 'friendly', 'arkose', 'altcha'];
    protected array $data = ['provider' => 'disabled', 'secret' => '', 'sitekey' => '', 'min_score' => 0.5];

    protected function validate(string $key, mixed $value): void
    {
        if ($key === 'provider' && !in_array($value, self::PROVIDERS, true)) throw new InvalidArgumentException('Unknown CAPTCHA provider.');
        if (in_array($key, ['secret', 'sitekey'], true) && (!is_string($value) || strlen($value) > 4096)) throw new InvalidArgumentException('Invalid CAPTCHA key.');
        if ($key === 'min_score' && (!is_numeric($value) || $value < 0 || $value > 1)) throw new InvalidArgumentException('CAPTCHA score must be between zero and one.');
    }

    public function save(): bool
    {
        if ($this->get('provider') !== 'disabled' && trim($this->get('secret')) === '') throw new InvalidArgumentException('A CAPTCHA secret is required.');
        return parent::save();
    }
}
