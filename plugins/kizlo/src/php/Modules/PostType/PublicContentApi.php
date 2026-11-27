<?php

namespace Kizlo\Modules\PostType;

use Kizlo\Modules\Introspection\CoreCollectionParams;
use Kizlo\Modules\Introspection\CoreControllers;
use Kizlo\Modules\Introspection\CoreItemSchema;
use Kizlo\Modules\Introspection\ManagedPostTypes;
use Kizlo\Modules\Introspection\RouteRegistrar;
use Kizlo\Modules\Preview\PreviewToken;
use WP_Error;
use WP_Post;
use WP_REST_Request;
use WP_REST_Response;

/** Public reads have their own view schema; managed administration stays in edit context. */
final class PublicContentApi
{
    public function register(): void
    {
        add_action('rest_api_init', [$this, 'routes']);
    }

    public function routes(): void
    {
        foreach (self::definitions()['routes'] as $declaration) {
            $slug = substr($declaration['id'], strlen('kizlo.content.'));
            RouteRegistrar::registerManaged($declaration, fn(WP_REST_Request $request) => $this->read($slug, $declaration['operation'] === 'retrieve', $request));
        }
    }

    /** @return array{schemas: array<string, array<string, mixed>>, routes: array<int, array<string, mixed>>} */
    public static function definitions(): array
    {
        $schemas = [];
        $routes = [];
        foreach (ManagedPostTypes::managed() as $slug => $type) {
            if (!$type->public || $slug === 'attachment') continue;
            $id = 'kizlo.content.' . $slug;
            $controller = CoreControllers::forPostType($slug);
            $properties = CoreItemSchema::responseForController($controller, '/content/' . $slug, 'view');
            $managed = ManagedPostTypes::schemas();
            $properties['kizlo'] = $managed[ManagedPostTypes::apiId($slug) . '.item']['properties']['kizlo'];
            $properties['kizlo']['nullable'] = true;
            $schemas[$id] = ['type' => 'object', 'properties' => $properties];
            $params = CoreCollectionParams::forPostType($slug);
            unset($params['status'], $params['password'], $params['context']);
            foreach (['list', 'retrieve'] as $operation) {
                $single = $operation === 'retrieve';
                $routes[] = [
                    'id' => $id, 'namespace' => KIZLO_API_NAMESPACE, 'operation' => $operation, 'access' => 'public', 'method' => 'GET',
                    'route' => '/content/' . $slug . ($single ? '/(?P<identifier>[^/]+)' : ''),
                    'summary' => ($single ? 'Retrieve public ' : 'List published ') . $slug . ' content',
                    'input' => ['type' => 'object', 'properties' => $single ? [
                        'identifier' => ['type' => 'string', 'required' => true],
                        'password' => ['type' => 'string'],
                        'preview_token' => ['type' => 'string'],
                    ] : $params],
                    'errors' => $single ? ['post_type_not_found', 'rest_post_incorrect_password', 'rest_post_invalid_id']
                        : ['rest_post_invalid_page_number', 'rest_no_search_term_defined', 'rest_orderby_include_missing_include'],
                    'responses' => [
                        '200' => ['description' => 'Public content.', 'body' => $single ? ['$ref' => $id] : ['type' => 'array', 'items' => ['$ref' => $id]]],
                        '404' => ['description' => 'Content not found.', 'body' => ['$ref' => 'kizlo.error']],
                    ],
                ];
            }
        }
        return ['schemas' => $schemas, 'routes' => $routes];
    }

    private function read(string $slug, bool $single, WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $request->set_param('context', 'view');
        $controller = CoreControllers::forPostType($slug);
        if (!$single) {
            $request->set_param('status', ['publish']);
            $permission = $controller->get_items_permissions_check($request);
            if ($permission instanceof WP_Error) return $permission;
            $response = $controller->get_items($request);
            if ($response instanceof WP_Error) return $response;
            $response->set_data(array_map(fn(array $item): array => $this->present($item, $request), $response->get_data()));
            return $response;
        }
        $identifier = (string) $request->get_param('identifier');
        $post = ctype_digit($identifier) ? get_post((int) $identifier) : get_page_by_path($identifier, OBJECT, $slug);
        if (!$post instanceof WP_Post || $post->post_type !== $slug) return self::notFound();
        $previewToken = (string) $request->get_param('preview_token');
        if ($previewToken !== '') {
            $post = PreviewToken::resolve($previewToken, $post);
            if (!$post instanceof WP_Post) return self::notFound();
            $request->set_param('password', $post->post_password);
        } elseif ($post->post_status !== 'publish') {
            return self::notFound();
        }
        $request->set_param('id', $post->ID);
        if ($previewToken === '') {
            $permission = $controller->get_item_permissions_check($request);
            if ($permission instanceof WP_Error) return $permission;
        }
        $response = $controller->get_item($request);
        if ($response instanceof WP_Error) return $response;
        $response->set_data($this->present($response->get_data(), $request));
        if ($previewToken !== '' || $post->post_password !== '') $response->header('Cache-Control', 'private, no-store');
        return $response;
    }

    /** @param array<string, mixed> $item @return array<string, mixed> */
    private function present(array $item, WP_REST_Request $request): array
    {
        $post = get_post($item['id']);
        $extension = new PostTypeExtension();
        $item = $extension->extendSingle($item, $post);
        if ($post instanceof WP_Post && $post->post_password !== '' && !hash_equals($post->post_password, (string) $request->get_param('password'))) {
            $item['kizlo'] = null;
            $item['meta'] = (object) [];
        }
        return $item;
    }

    private static function notFound(): WP_Error
    {
        return new WP_Error('post_type_not_found', 'Content not found.', ['status' => 404]);
    }
}
