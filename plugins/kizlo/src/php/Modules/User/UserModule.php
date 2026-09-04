<?php

namespace Kizlo\Modules\User;

class UserModule
{
    public UserApi $user_api;
    public ExternalUserApi $external_user_api;
    public UserExtension $user_extension;

    public function __construct()
    {
        $this->user_api = new UserApi();
        $this->external_user_api = new ExternalUserApi();
        $this->user_extension = new UserExtension();
    }

    public function register()
    {
        $this->user_api->register();
        $this->external_user_api->register();
        $this->user_extension->register();
    }
}
