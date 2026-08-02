<?php

namespace Kizlo\Modules\Admin;

use Kizlo\Modules\Settings\SettingsModule;
use Kizlo\Modules\Headless\Onboarding;

class AdminModule
{
    public function register(): void
    {
        (new PluginSettingsPage(new SettingsModule()))->register();
        (new Onboarding())->register();
    }
}
