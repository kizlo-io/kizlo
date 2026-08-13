<?php

namespace Kizlo\Modules\Settings\Taxonomy;

use InvalidArgumentException;
use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Registration\DefinitionController;
use Kizlo\Modules\Registration\TaxonomyRegistration;
use Kizlo\Modules\Settings\DefinitionSchemas;
use Kizlo\Modules\Settings\SettingsSchemas;
use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;
use WP_Taxonomy;

class TaxonomySettingsService
{
    private const KIND = 'taxonomies';

    private const API_ID = 'settings.taxonomies';

    /**
     * Properties the item response carries that no request writes.
     * {@see \Kizlo\Modules\Settings\PostType\PostTypeSettingsService} explains
     * the two that look writable and are, through the registration half.
     *
     * @var string[]
     */
    private const READ_ONLY = [
        'name',
        'slug',
        'hierarchical',
        'internal',
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
     * Register taxonomy settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register the unified taxonomy routes. A single `/settings/taxonomies`
     * surface owns both the Kizlo settings and the Kizlo-owned WordPress
     * definition, plus create and the resumable delete.
     */
    private function registerRestRoutes(): void
    {
        $single = '/settings/taxonomies/(?P<slug>[a-z0-9_-]+)';

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'create',
            'method'    => 'POST',
            'route'     => '/settings/taxonomies',
            'summary'   => 'Register a Kizlo-owned taxonomy',
            'input'     => DefinitionSchemas::createInput(SettingsSchemas::TAXONOMY_DEFINITION),
            'responses' => [
                '201' => ['description' => 'The registered taxonomy.', 'body' => ['$ref' => SettingsSchemas::DEFINITION_CREATED]],
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
            'method'    => 'PUT',
            'route'     => $single,
            'summary'   => 'Update a taxonomy',
            'input'     => DefinitionSchemas::updateInput(
                SettingsSchemas::TAXONOMY,
                SettingsSchemas::TAXONOMY_DEFINITION,
                self::READ_ONLY,
            ),
            'responses' => [
                '200' => ['description' => 'The updated taxonomy.', 'body' => ['$ref' => SettingsSchemas::TAXONOMY]],
                '400' => ['description' => 'Unknown taxonomy, or a rejected field definition.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response($this->update($request)),
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'activate',
            'method'    => 'POST',
            'route'     => $single . '/activate',
            'summary'   => 'Register a Kizlo-owned taxonomy with WordPress',
            'input'     => DefinitionSchemas::slugInput(),
            'responses' => DefinitionSchemas::activeResponses(),
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->setActive(self::KIND, (string) $request->get_param('slug'), true)
            ),
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'deactivate',
            'method'    => 'POST',
            'route'     => $single . '/deactivate',
            'summary'   => 'Unregister a Kizlo-owned taxonomy, keeping its terms',
            'input'     => DefinitionSchemas::slugInput(),
            'responses' => DefinitionSchemas::activeResponses(),
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->setActive(self::KIND, (string) $request->get_param('slug'), false)
            ),
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'delete',
            'method'    => 'POST',
            'route'     => $single . '/delete',
            'summary'   => 'Delete a Kizlo-owned taxonomy',
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
            'method'    => 'POST',
            'route'     => $single . '/delete/process',
            'summary'   => 'Delete the next batch of terms',
            'input'     => DefinitionSchemas::slugInput(),
            'responses' => DefinitionSchemas::progressResponses(),
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->processDelete(self::KIND, (string) $request->get_param('slug'))
            ),
        ]);

        kizlo_register_route([
            'id'        => self::API_ID,
            'operation' => 'retry_delete',
            'method'    => 'POST',
            'route'     => $single . '/delete/retry',
            'summary'   => 'Requeue the terms that failed to delete',
            'input'     => DefinitionSchemas::slugInput(),
            'responses' => DefinitionSchemas::progressResponses(),
            'callback'  => fn(WP_REST_Request $request) => new WP_REST_Response(
                $this->definitions->retryDelete(self::KIND, (string) $request->get_param('slug'))
            ),
        ]);
    }

    /**
     * Combined save: applies the definition portion of the payload (when this is
     * a Kizlo-owned taxonomy) and the per-slug Kizlo settings from the same body.
     *
     * @return array<string, mixed>
     */
    private function update(WP_REST_Request $request): array
    {
        $slug     = (string) $request->get_param('slug');
        $taxonomy = get_taxonomy($slug);

        // Inactive Kizlo-owned definitions have no runtime object but stay
        // editable; synthesize one from the definition for the response.
        if (!$taxonomy && TaxonomyRegistration::exists($slug)) {
            $definition = TaxonomyRegistration::load($slug);
            $taxonomy   = new WP_Taxonomy($slug, $definition->getConnectedPostTypes(), $definition->toArgs());
        }

        if (!$taxonomy) {
            throw new InvalidArgumentException("Unknown taxonomy: {$slug}.");
        }

        $body = $request->get_json_params() ?: [];

        if (TaxonomyRegistration::exists($slug)) {
            $this->definitions->updateDefinition(self::KIND, $slug, $body);
        }

        $settings = TaxonomySettings::load($slug);
        $settings->setData($body);
        $settings->save($slug);

        Webhook::sendEvent(Webhook::SETTINGS_TAXONOMY_UPDATED_EVENT, ['key' => $slug]);

        // Reflect definition changes in the response by rebuilding from the
        // freshly saved definition.
        if (TaxonomyRegistration::exists($slug)) {
            $definition = TaxonomyRegistration::load($slug);
            $taxonomy   = new WP_Taxonomy($slug, $definition->getConnectedPostTypes(), $definition->toArgs());
        }

        return $this->toItemResponse($taxonomy, $settings);
    }

    /**
     * Get all registered public taxonomies with their saved settings.
     *
     * @return array<int, array<string, mixed>>
     */
    public function toResponse(TaxonomySettingsCollection $collection): array
    {
        $result = [];

        foreach (TaxonomySettings::getAvailableObjects() as $taxonomy) {
            $result[] = $this->toItemResponse($taxonomy, $collection->get($taxonomy->name));
        }

        return $result;
    }

    /**
     * Merge a single taxonomy's runtime metadata with its saved settings.
     *
     * @return array<string, mixed>
     */
    public function toItemResponse(WP_Taxonomy $taxonomy, TaxonomySettings $settings): array
    {
        $registration = TaxonomyRegistration::exists($taxonomy->name)
            ? TaxonomyRegistration::load($taxonomy->name)
            : null;

        return array_merge(
            [
                'name'               => $taxonomy->label,
                'slug'               => $taxonomy->name,
                'hierarchical'       => $registration ? $registration->isHierarchical() : $taxonomy->hierarchical,
                'internal'           => TaxonomySettings::checkInternal($taxonomy->name),
                'kizlo_owned'        => $registration !== null,
                'active'             => $registration ? $registration->isActive() : true,
                'registration'       => $registration?->getData(),
            ],
            $settings->getData()
        );
    }
}
