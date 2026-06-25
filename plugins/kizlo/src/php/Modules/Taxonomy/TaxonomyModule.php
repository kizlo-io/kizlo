<?php

namespace Kizlo\Modules\Taxonomy;

class TaxonomyModule
{
    public function register(): void
    {
        (new TermListener())->register();
    }
}
