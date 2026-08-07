<?php

namespace Kizlo\Modules\Settings\PostType;

use InvalidArgumentException;
use Kizlo\Modules\Registration\DefinitionController;
use Kizlo\Modules\Registration\PostTypeRegistration;
use Kizlo\Modules\Webhook\Webhook;
use WP_Post_Type;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Variables;

class PostTypeSettingsService
{
    private const KIND = 'post_types';

    private DefinitionController $definitions;

    public function __construct()
    {
        $this->definitions = new DefinitionController();
    }

    /**
     * Register post type settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register the unified post type routes. A single `/settings/post_types`
     * surface now owns both the Kizlo settings (custom fields, SEO, pathname,
     * API access) and the Kizlo-owned WordPress definition (labels, supports,
     * admin UI, permalinks, capabilities), plus create and the resumable delete.
     */
    private function registerRestRoutes(): void
    {
        $single = '/settings/post_types/(?P<slug>[a-z0-9_-]+)';

        kizlo_register_route([
            'methods'  => 'POST',
            'route'    => '/settings/post_types',
            'callback' => function (WP_REST_Request $request) {
                $body = $request->get_json_params() ?: [];

                return new WP_REST_Response($this->definitions->create(self::KIND, $body), 201);
            },
        ]);

        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => $single,
            'callback' => fn(WP_REST_Request $request) => new WP_REST_Response($this->update($request)),
        ]);

        kizlo_register_route([
            'methods'  => 'POST',
            'route'    => $single . '/activate',
            'callback' => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->setActive(self::KIND, (string) $request->get_param('slug'), true)
            ),
        ]);

        kizlo_register_route([
            'methods'  => 'POST',
            'route'    => $single . '/deactivate',
            'callback' => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->setActive(self::KIND, (string) $request->get_param('slug'), false)
            ),
        ]);

        kizlo_register_route([
            'methods'  => 'POST',
            'route'    => $single . '/delete',
            'callback' => function (WP_REST_Request $request) {
                $body = $request->get_json_params() ?: [];

                return new WP_REST_Response(
                    $this->definitions->delete(self::KIND, (string) $request->get_param('slug'), (string) ($body['mode'] ?? 'keep_items'))
                );
            },
        ]);

        kizlo_register_route([
            'methods'  => 'POST',
            'route'    => $single . '/delete/process',
            'callback' => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->processDelete(self::KIND, (string) $request->get_param('slug'))
            ),
        ]);

        kizlo_register_route([
            'methods'  => 'POST',
            'route'    => $single . '/delete/retry',
            'callback' => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->retryDelete(self::KIND, (string) $request->get_param('slug'))
            ),
        ]);
    }

    /**
     * Combined save: applies the definition portion of the payload (when this is
     * a Kizlo-owned type) and the per-slug Kizlo settings from the same body.
     * `setData` ignores keys it does not declare, so one payload feeds both.
     *
     * @return array<string, mixed>
     */
    private function update(WP_REST_Request $request): array
    {
        $slug      = (string) $request->get_param('slug');
        $post_type = get_post_type_object($slug);

        // Inactive Kizlo-owned definitions have no runtime object but stay
        // editable; synthesize one from the definition for the response.
        if (!$post_type && PostTypeRegistration::exists($slug)) {
            $post_type = new WP_Post_Type($slug, PostTypeRegistration::load($slug)->toArgs());
        }

        if (!$post_type) {
            throw new InvalidArgumentException("Unknown post type: {$slug}.");
        }

        $body = $request->get_json_params() ?: [];

        if (PostTypeRegistration::exists($slug)) {
            $this->definitions->updateDefinition(self::KIND, $slug, $body);
        }

        $settings = PostTypeSettings::load($slug);
        $settings->setData($body);
        $settings->save($slug);

        Webhook::sendEvent(Webhook::SETTINGS_POST_TYPE_UPDATED_EVENT, ['key' => $slug]);

        // Reflect definition changes (label, supports, hierarchical) in the
        // response by rebuilding from the freshly saved definition.
        if (PostTypeRegistration::exists($slug)) {
            $post_type = new WP_Post_Type($slug, PostTypeRegistration::load($slug)->toArgs());
        }

        return $this->toItemResponse($post_type, $settings);
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
        $registration = PostTypeRegistration::exists($post_type->name)
            ? PostTypeRegistration::load($post_type->name)
            : null;

        return array_merge(
            [
                'name'               => $post_type->label,
                'slug'               => $post_type->name,
                'hierarchical'       => $registration ? $registration->isHierarchical() : $post_type->hierarchical,
                'supports'           => $registration ? $registration->getSupportsMap() : PostTypeSettings::getSupports($post_type->name),
                'internal'           => PostTypeSettings::checkInternal($post_type->name),
                'content_variables'  => Variables::forPostType($post_type->name),
                'kizlo_owned'        => $registration !== null,
                'active'             => $registration ? $registration->isActive() : true,
                'registration'       => $registration?->getData(),
            ],
            $settings->getData()
        );
    }
}
