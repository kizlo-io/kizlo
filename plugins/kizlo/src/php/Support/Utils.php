<?php

namespace Kizlo\Support;

use Kizlo\Modules\Settings\Settings;

class Utils
{

    /**
     * Retrieve all plugin settings as a hydrated Settings object.
     * Loaded from transient cache if available, rebuilt and cached otherwise.
     *
     * @return Settings
     */
    public static function getSettings(): Settings
    {
        return Settings::cached();
    }
}
