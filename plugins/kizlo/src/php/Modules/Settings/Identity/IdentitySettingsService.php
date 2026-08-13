<?php

namespace Kizlo\Modules\Settings\Identity;

use Kizlo\Modules\Introspection\CoreSchemas;
use Kizlo\Modules\Settings\SettingsSchemas;
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
            'id'        => 'settings.identity',
            'operation' => 'update',
            'method'    => 'PUT',
            'route'     => '/settings/identity',
            'summary'   => 'Update the site identity',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'type'         => ['type' => 'string', 'enum' => IdentitySettings::IDENTITY_TYPES],
                    'person'       => $this->personInput(),
                    'organization' => $this->organizationInput(),
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The saved identity.', 'body' => ['$ref' => SettingsSchemas::IDENTITY]],
                '400' => ['description' => 'A media ID or profile URL was rejected.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => function (WP_REST_Request $request) {
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

                return new WP_REST_Response($this->toResponse(IdentitySettings::load()));
            },
        ]);
    }

    /**
     * Only the node matching the saved `type` is written, and each is a partial
     * update, so every property here is optional.
     *
     * @return array<string, mixed>
     */
    private function personInput(): array
    {
        return [
            'type'        => 'object',
            'description' => 'Written only while `type` is "person".',
            'properties'  => [
                'user_id'         => ['type' => 'integer', 'nullable' => true],
                'image'           => ['type' => 'integer', 'nullable' => true, 'description' => 'Attachment ID.'],
                'social_profiles' => self::socialProfilesInput(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function organizationInput(): array
    {
        $strings = [
            'name',
            'alternate_name',
            'slogan',
            'description',
            'email',
            'phone',
            'legal_name',
            'founding_date',
            'vat_id',
            'tax_id',
            'iso6523_code',
            'duns',
            'lei_code',
            'naics',
            'publishing_principles',
            'ownership_funding_info',
            'actionable_feedback_policy',
            'corrections_policy',
            'ethics_policy',
            'diversity_policy',
            'diversity_staffing_report',
        ];

        $properties = [];

        foreach ($strings as $key) {
            $properties[$key] = ['type' => 'string', 'nullable' => true];
        }

        $properties['founder'] = [
            'type'       => 'object',
            'nullable'   => true,
            'properties' => [
                'name'            => ['type' => 'string', 'required' => true],
                'social_profiles' => self::socialProfilesInput(),
            ],
        ];
        $properties['employees_min']   = ['type' => 'integer', 'nullable' => true];
        $properties['employees_max']   = ['type' => 'integer', 'nullable' => true];
        $properties['logo']            = ['type' => 'integer', 'nullable' => true, 'description' => 'Attachment ID.'];
        $properties['social_profiles'] = self::socialProfilesInput();

        return [
            'type'        => 'object',
            'description' => 'Written only while `type` is "organization".',
            'properties'  => $properties,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function socialProfilesInput(): array
    {
        return [
            'type'  => 'array',
            'items' => [
                'type'       => 'object',
                'properties' => [
                    'url'      => ['type' => 'string', 'required' => true, 'format' => 'uri'],
                    'platform' => ['type' => 'string', 'required' => true],
                ],
            ],
        ];
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
