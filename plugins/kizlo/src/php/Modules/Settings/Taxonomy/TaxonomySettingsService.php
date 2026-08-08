<?php

namespace Kizlo\Modules\Settings\Taxonomy;

use InvalidArgumentException;
use Kizlo\Modules\Registration\DefinitionController;
use Kizlo\Modules\Registration\TaxonomyRegistration;
use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;
use WP_Taxonomy;

class TaxonomySettingsService
{
    private const KIND = 'taxonomies';

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
            'methods'  => 'POST',
            'route'    => '/settings/taxonomies',
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
