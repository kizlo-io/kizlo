<?php

namespace Kizlo\Kernel;

class ModuleLoader
{
    /**
     * @param array<int, class-string> $modules
     */
    public function __construct(private array $modules) {}

    public function load(): void
    {
        foreach ($this->modules as $module) {
            $instance = new $module();
            $instance->register();
        }
    }
}
