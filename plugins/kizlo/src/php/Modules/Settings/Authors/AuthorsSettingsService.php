<?php

namespace Kizlo\Modules\Settings\Authors;

use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;

class AuthorsSettingsService
{
    /**
     * Register authors settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register GET and PUT routes for authors settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => '/settings/authors',
            'callback' => function (WP_REST_Request $request) {
                $settings = AuthorsSettings::load();
                $settings->setData($request->get_json_params());
                $settings->save();

                Webhook::sendEvent(Webhook::SETTINGS_AUTHORS_UPDATED_EVENT);

                return new WP_REST_Response(null, 204);
            },
        ]);
    }

    /**
     * Get authors settings data for aggregated response.
     *
     * @return array<string, mixed>
     */
    public function toResponse(AuthorsSettings $settings): array
    {
        return $settings->getData();
    }
}
