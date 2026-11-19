<?php

namespace Kizlo\Modules\Integrations;

final class Integrations
{
    public readonly WhatsApp $whatsapp;

    public function __construct()
    {
        $this->whatsapp = new WhatsApp();
    }
}
