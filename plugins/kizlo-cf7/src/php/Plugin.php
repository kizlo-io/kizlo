<?php

namespace Kizlo\Cf7;

use Kizlo\Cf7\Modules\Cf7\Cf7Module;

class Plugin
{
    private static ?Plugin $instance = null;

    /**
     * @var array<int, class-string>
     */
    private array $modules = [
        Cf7Module::class,
    ];

    private function __construct() {}

    public static function instance(): Plugin
    {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    public function boot(): void
    {
        foreach ($this->modules as $module) {
            (new $module())->register();
        }
    }
}
