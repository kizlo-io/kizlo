<?php

namespace Kizlo\Modules\Introspection;

class IntrospectionModule
{
    public function register(): void
    {
        (new IntrospectionController())->register();
    }
}
