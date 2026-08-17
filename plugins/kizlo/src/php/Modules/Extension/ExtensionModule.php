<?php

namespace Kizlo\Modules\Extension;

class ExtensionModule
{
    public function register(): void
    {
        (new ExtensionNotice())->register();
    }
}
