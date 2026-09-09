<?php

namespace Kizlo\Acf;

use Kizlo\Acf\Modules\Acf\AcfModule;
use YahnisElsts\PluginUpdateChecker\v5\PucFactory;

class Plugin
{
    private static ?Plugin $instance = null;

    /**
     * @var array<int, class-string>
     */
    private array $modules = [
        AcfModule::class,
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
        PucFactory::buildUpdateChecker(
            'https://kizlo.io/plugin/updates/kizlo-acf.json',
            KIZLO_ACF_FILE,
            'kizlo-acf'
        );

        foreach ($this->modules as $module) {
            (new $module())->register();
        }
    }
}
