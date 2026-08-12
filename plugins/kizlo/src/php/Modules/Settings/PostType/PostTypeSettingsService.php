<?php

namespace Kizlo\Modules\Settings\PostType;

use InvalidArgumentException;
use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Registration\DefinitionController;
use Kizlo\Modules\Registration\PostTypeRegistration;
use Kizlo\Modules\Settings\DefinitionSchemas;
use Kizlo\Modules\Settings\SettingsSchemas;
use Kizlo\Modules\Webhook\Webhook;
use WP_Post_Type;
use WP_REST_Request;
use WP_REST_Response;
use Kizlo\Support\Variables;

class PostTypeSettingsService
{
    private const KIND = 'post_types';

    private const API_ID = 'settings.post-types';

    /**
     * Properties the item response carries that no request writes. Some are
     * WordPress metadata (`name`, `supports`), the rest are decided by whether
     * Kizlo owns the registration. `hierarchical` and `active` are writable, but
     * through the registration half of the body rather than this list.
     *
     * @var string[]
     */
    private const READ_ONLY = [
        'name',
        'slug',
        'hierarchical',
        'supports',
        'internal',
        'content_variables',
        'kizlo_owned',
        'active',
        'registration',
    ];

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
            'id'        => self::API_ID,
            'operation' => 'create',
            'methods'   => 'POST',
            'route'     => '/settings/post_types',
            'summary'   => 'Register a Kizlo-owned post type',
            'input'     => DefinitionSchemas::createInput(SettingsSchemas::POST_TYPE_DEFINITION),
            'responses' => [
                '201' => ['description' => 'The registered post type.', 'body' => ['$ref' => SettingsSchemas::DEFINITION_CREATED]],
                '400' => ['description' => 'The key or labels were rejected.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => function (WP_REST_Request $request) {
                $body = $request->get_json_params() ?: [];

                return new WP_REST_Response($this->definitions->create(self::KIND, $body), 201);
            },
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'update',
            'methods'   => 'PUT',
            'route'     => $single,
            'summary'   => 'Update a post type',

            // One body feeds two writes: the Kizlo settings for any post type,
            // and the WordPress registration as well when Kizlo owns it. Both
            // ignore keys they do not declare, so the properties are flat.
            'input'     => DefinitionSchemas::updateInput(
                SettingsSchemas::POST_TYPE,
                SettingsSchemas::POST_TYPE_DEFINITION,
                self::READ_ONLY,
            ),
            'responses' => [
                '200' => ['description' => 'The updated post type.', 'body' => ['$ref' => SettingsSchemas::POST_TYPE]],
                '400' => ['description' => 'Unknown post type, or a rejected field definition.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response($this->update($request)),
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'activate',
            'methods'   => 'POST',
            'route'     => $single . '/activate',
            'summary'   => 'Register a Kizlo-owned post type with WordPress',
            'input'     => DefinitionSchemas::slugInput(),
            'responses' => DefinitionSchemas::activeResponses(),
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->setActive(self::KIND, (string) $request->get_param('slug'), true)
            ),
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'deactivate',
            'methods'   => 'POST',
            'route'     => $single . '/deactivate',
            'summary'   => 'Unregister a Kizlo-owned post type, keeping its entries',
            'input'     => DefinitionSchemas::slugInput(),
            'responses' => DefinitionSchemas::activeResponses(),
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->setActive(self::KIND, (string) $request->get_param('slug'), false)
            ),
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'delete',
            'methods'   => 'POST',
            'route'     => $single . '/delete',
            'summary'   => 'Delete a Kizlo-owned post type',
            'input'     => DefinitionSchemas::deleteInput(),
            'responses' => DefinitionSchemas::deleteResponses(),
            'callback'  => function (WP_REST_Request $request) {
                $body = $request->get_json_params() ?: [];

                return new WP_REST_Response(
                    $this->definitions->delete(self::KIND, (string) $request->get_param('slug'), (string) ($body['mode'] ?? 'keep_items'))
                );
            },
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'process_delete',
            'methods'   => 'POST',
            'route'     => $single . '/delete/process',
            'summary'   => 'Delete the next batch of entries',
            'input'     => DefinitionSchemas::slugInput(),
            'responses' => DefinitionSchemas::progressResponses(),
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->processDelete(self::KIND, (string) $request->get_param('slug'))
            ),
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'retry_delete',
            'methods'   => 'POST',
            'route'     => $single . '/delete/retry',
            'summary'   => 'Requeue the entries that failed to delete',
            'input'     => DefinitionSchemas::slugInput(),
            'responses' => DefinitionSchemas::progressResponses(),
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response(
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
