<?php

namespace Kizlo\Modules\Taxonomy;

use Kizlo\Modules\CoreApi\RouteDiscovery;

class TaxonomyModule
{
    public function register(): void
    {
        (new TermListener())->register();
        (new TermExtension())->register();
        (new TaxonomyApi())->register();

        add_filter(RouteDiscovery::SCHEMA_FILTER, [TermRouteSchemas::class, 'contribute'], 10, 5);
    }
}
