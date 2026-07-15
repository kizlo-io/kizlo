<?php

namespace Kizlo\Modules\Settings\Taxonomy;

use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;

class TaxonomySettingsService
{
    /**
     * Register taxonomy settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register GET and PUT routes for taxonomy settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => '/settings/taxonomies/(?P<slug>[a-z0-9_-]+)',
            'callback' => function (WP_REST_Request $request) {
                $slug     = $request->get_param('slug');
                $settings = TaxonomySettings::load($slug);
                $settings->setData($request->get_json_params());
                $settings->save($slug);

                Webhook::sendEvent(Webhook::SETTINGS_TAXONOMY_UPDATED_EVENT, ['key' => $slug]);

                return new WP_REST_Response(null, 204);
            },
        ]);
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
            $settings = $collection->get($taxonomy->name);

            $result[] = array_merge(
                [
                    'name'               => $taxonomy->label,
                    'slug'               => $taxonomy->name,
                    'hierarchical'       => $taxonomy->hierarchical,
                    'publicly_queryable' => $taxonomy->publicly_queryable,
                    'internal'           => TaxonomySettings::checkInternal($taxonomy->name),
                ],
                $settings->getData()
            );
        }

        return $result;
    }
}
