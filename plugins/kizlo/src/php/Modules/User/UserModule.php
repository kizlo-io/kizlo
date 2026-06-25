<?php

namespace Kizlo\Modules\User;

class UserModule
{
    public UserApi $user_api;
    public UserExtension $user_extension;

    public function __construct()
    {
        $this->user_api = new UserApi();
        $this->user_extension = new UserExtension();
    }

    public function register()
    {
        $this->user_api->register();
        $this->user_extension->register();
    }
}
