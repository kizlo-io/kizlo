<?php

namespace Kizlo\Modules\Settings\Identity;

use Kizlo\Modules\Webhook\Webhook;
use WP_REST_Request;
use WP_REST_Response;

class IdentitySettingsService
{
    /**
     * Register identity settings REST routes.
     */
    public function register(): void
    {
        $this->registerRestRoutes();
    }

    /**
     * Register GET and PUT routes for identity settings.
     */
    private function registerRestRoutes(): void
    {
        kizlo_register_route([
            'methods'  => 'PUT',
            'route'    => '/settings/identity',
            'callback' => function (WP_REST_Request $request) {
                $data = $request->get_json_params();

                $identity = IdentitySettings::load();

                if (isset($data['type'])) {
                    $identity->setType($data['type']);
                    $identity->save();
                }

                if ($identity->isPerson() && isset($data['person'])) {
                    PersonSettings::load()->setData($data['person'])->save();
                }

                if ($identity->isOrganization() && isset($data['organization'])) {
                    OrganizationSettings::load()->setData($data['organization'])->save();
                }

                Webhook::sendEvent(Webhook::SETTINGS_IDENTITY_UPDATED_EVENT);

                return new WP_REST_Response(null, 204);
            },
        ]);
    }

    public function toResponse(IdentitySettings $settings): array
    {
        $person = $settings->person->getData();
        $organization = $settings->organization->getData();

        if (!empty($person['image'])) {
            $person['image'] = kizlo_ensure_media_data($person['image']);
        }

        if (!empty($organization['logo'])) {
            $organization['logo'] = kizlo_ensure_media_data($organization['logo']);
        }

        return [
            'type'         => $settings->getType(),
            'person'       => $person,
            'organization' => $organization
        ];
    }
}
