<?php

namespace Kizlo\Modules\Appearance;

use Kizlo\Modules\Introspection\CoreCollectionParams;
use Kizlo\Modules\Introspection\CoreItemSchema;
use WP_Error;
use WP_REST_Menu_Items_Controller;
use WP_REST_Request;
use WP_REST_Response;

final class PublicMenus
{
    public function register(): void
    {
        kizlo_register_route_schema('kizlo.public-menu-item', static function (): array {
            $properties = CoreItemSchema::responseForController(new WP_REST_Menu_Items_Controller('nav_menu_item'), '/public-menu-items', 'view');
            return ['type' => 'object', 'properties' => $properties];
        });
        $params = CoreCollectionParams::forController(new WP_REST_Menu_Items_Controller('nav_menu_item'), '/public-menu-items');
        unset($params['status'], $params['context']);
        kizlo_register_route([
            'id' => 'kizlo.menu-items', 'operation' => 'list', 'access' => 'public', 'method' => 'GET', 'route' => '/menu-items',
            'summary' => 'List published navigation items', 'input' => ['type' => 'object', 'properties' => $params],
            'errors' => ['rest_no_search_term_defined', 'rest_orderby_include_missing_include', 'rest_post_invalid_page_number'],
            'responses' => ['200' => ['body' => ['type' => 'array', 'items' => ['$ref' => 'kizlo.public-menu-item']]]],
            'callback' => [$this, 'retrieve'],
        ]);
    }

    public function retrieve(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $request->set_param('context', 'view');
        $request->set_param('status', ['publish']);
        $response = (new WP_REST_Menu_Items_Controller('nav_menu_item'))->get_items($request);
        if ($response instanceof WP_Error) return $response;
        $response->set_data(array_values(array_filter($response->get_data(), static function (array $item): bool {
            if (($item['type'] ?? null) === 'post_type') return get_post_status($item['object_id']) === 'publish';
            return !($item['invalid'] ?? false);
        })));
        return $response;
    }
}
