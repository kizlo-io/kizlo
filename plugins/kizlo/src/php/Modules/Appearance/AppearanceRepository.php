<?php

namespace Kizlo\Modules\Appearance;

class AppearanceRepository
{

    public function extendMenuItem(array $data, object $menu_item): array
    {
        $data['kizlo'] = array_merge([
        ], kizlo_apply_extend_filter('menu_item', $menu_item));

        return $data;
    }
}
