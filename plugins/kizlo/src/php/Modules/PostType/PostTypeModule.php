<?php

namespace Kizlo\Modules\PostType;

class PostTypeModule
{
    private PostTypeApi $post_type;
    private ThumbnailSupport $thumbnail_support;

    public function __construct()
    {
        $this->post_type         = new PostTypeApi();
        $this->thumbnail_support = new ThumbnailSupport();
    }

    public function register()
    {
        $this->post_type->register();
        $this->thumbnail_support->register();
    }
}
