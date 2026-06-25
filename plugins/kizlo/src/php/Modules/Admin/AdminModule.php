<?php

namespace Kizlo\Modules\Admin;

use Kizlo\Modules\Settings\SettingsModule;

class AdminModule
{
    public function register(): void
    {
        (new PluginSettingsPage(new SettingsModule()))->register();
    }
}
