<?php

namespace Kizlo\Modules\RestApi;

class RestApiModule
{
    public function register(): void
    {
        (new RestGuard())->register();
    }
}
