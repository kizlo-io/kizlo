<?php

namespace Kizlo\Modules\Appearance;

use WP_REST_Response;
use Kizlo\Modules\Appearance\AppearanceRepository;
use WP_Error;

class AppearanceModule
{
    private AppearanceRepository $appearance;

    public function __construct()
    {
        $this->appearance = new AppearanceRepository();
    }

    public function register(): void
    {
        add_filter('rest_prepare_nav_menu_item', [$this, 'prepareMenuItemCallback'], PHP_INT_MAX, 2);
    }

    public function prepareMenuItemCallback(WP_REST_Response | WP_Error $response, object $menu_item): WP_REST_Response | WP_Error
    {
        if (is_wp_error($response)) return $response;

        $response->set_data($this->appearance->extendMenuItem($response->get_data(), $menu_item));

        return $response;
    }
}
