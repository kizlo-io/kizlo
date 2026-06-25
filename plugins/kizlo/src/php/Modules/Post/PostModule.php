<?php

namespace Kizlo\Modules\Post;

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
    }
}
