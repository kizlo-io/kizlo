<?php

namespace Kizlo\Modules\Settings\PostType;

use InvalidArgumentException;
use Kizlo\Modules\Webhook\Webhook;
use WP_Post_Type;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Variables;

class PostTypeSettingsService
{
    /**
     * Register post type settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register GET and PUT routes for post type settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => '/settings/post_types/(?P<slug>[a-z0-9_-]+)',
            'callback' => function (WP_REST_Request $request) {
                $slug       = $request->get_param('slug');
                $post_type  = get_post_type_object($slug);

                if (!$post_type) {
                    throw new InvalidArgumentException("Unknown post type: {$slug}.");
                }

                $settings = PostTypeSettings::load($slug);
                $settings->setData($request->get_json_params());
                $settings->save($slug);

                Webhook::sendEvent(Webhook::SETTINGS_POST_TYPE_UPDATED_EVENT, ['key' => $slug]);

                return new WP_REST_Response($this->toItemResponse($post_type, $settings));
            },
        ]);
    }

    /**
     * @return array
     */
    public function toResponse(PostTypeSettingsCollection $collection): array
    {
        $result = [];

        foreach (PostTypeSettings::getAvailableObjects() as $post_type) {
            $result[] = $this->toItemResponse($post_type, $collection->get($post_type->name));
        }

        return $result;
    }

    /**
     * Merge a single post type's runtime metadata with its saved settings.
     *
     * @return array<string, mixed>
     */
    public function toItemResponse(WP_Post_Type $post_type, PostTypeSettings $settings): array
    {
        return array_merge(
            [
                'name'               => $post_type->label,
                'slug'               => $post_type->name,
                'hierarchical'       => $post_type->hierarchical,
                'supports'           => PostTypeSettings::getSupports($post_type->name),
                'internal'           => PostTypeSettings::checkInternal($post_type->name),
                'content_variables'  => Variables::forPostType($post_type->name),
            ],
            $settings->getData()
        );
    }
}
