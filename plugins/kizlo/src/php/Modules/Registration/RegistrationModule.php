<?php

namespace Kizlo\Modules\Registration;

/**
 * Wires the registration engine: registers active Kizlo-owned objects and opts
 * them into the pipeline (via {@see Registrar}). The admin REST surface lives on
 * the settings services, which drive {@see DefinitionController}.
 */
class RegistrationModule
{
    private Registrar $registrar;

    public function __construct()
    {
        $this->registrar = new Registrar();
    }

    public function register(): void
    {
        $this->registrar->register();
    }
}
