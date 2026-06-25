<?php

namespace Kizlo\Modules\PostType;

class PostTypeModule
{
    private PostTypeApi $post_type;

    public function __construct()
    {
        $this->post_type = new PostTypeApi();
    }

    public function register()
    {
        $this->post_type->register();
    }
}
