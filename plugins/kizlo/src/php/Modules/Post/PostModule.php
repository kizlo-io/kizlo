<?php

namespace Kizlo\Modules\Post;

use Kizlo\Modules\CoreApi\RouteDiscovery;

class PostModule
{
    public PostExtension $post_extension;
    public PostListener $post_listener;

    public function __construct()
    {
        $this->post_extension = new PostExtension();
        $this->post_listener = new PostListener();
    }

    public function register(): void
    {
        $this->post_extension->register();
        $this->post_listener->register();

        add_filter(RouteDiscovery::SCHEMA_FILTER, [PostRouteSchemas::class, 'contribute'], 10, 5);
    }
}
