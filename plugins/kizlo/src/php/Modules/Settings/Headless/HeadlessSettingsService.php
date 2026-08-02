<?php

namespace Kizlo\Modules\Settings\Headless;

use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;

class HeadlessSettingsService
{
    /**
     * Register headless settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register the PUT route for headless settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => '/settings/headless',
            'callback' => function (WP_REST_Request $request) {
                $settings = HeadlessSettings::load();
                $settings->setData($request->get_json_params())->save();

                update_option('blog_public', $settings->isEnabled('block_indexing') ? '0' : '1');

                Webhook::sendEvent(Webhook::SETTINGS_HEADLESS_UPDATED_EVENT);

                return new WP_REST_Response($this->toResponse($settings));
            },
        ]);
    }

    /**
     * @return array<string, bool>
     */
    public function toResponse(HeadlessSettings $settings): array
    {
        return $settings->getData();
    }
}
