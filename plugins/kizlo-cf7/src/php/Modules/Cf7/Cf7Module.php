<?php

namespace Kizlo\Cf7\Modules\Cf7;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WPCF7_ContactForm;

class Cf7Module
{
    private const RESULT = 'cf7.submission-result';

    /**
     * The Kizlo error envelope, by ID: this plugin talks to Kizlo through the
     * public functions rather than its classes.
     */
    private const ERROR = 'kizlo.error';

    public function register(): void
    {
        kizlo_register_spec_schema(self::RESULT, self::result());

        kizlo_register_route([
            'id'        => 'cf7.forms',
            'operation' => 'submit',
            'method'    => 'POST',
            'route'     => kizlo_route('/cf7/:form_id'),
            'summary'   => 'Submit a Contact Form 7 form',

            // The fields are the form's own, named in the form's markup, so the
            // body is open by definition. Only the form itself can say what it
            // accepts, and it says so by rejecting a submission.
            'input'     => [
                'type'                 => 'object',
                'additionalProperties' => true,
                'properties'           => [
                    'form_id' => [
                        'description'       => 'The ID of the Contact Form 7 form.',
                        'type'              => 'integer',
                        'required'          => true,
                        'sanitize_callback' => 'absint',
                        'validate_callback' => [$this, 'validate_form_id'],
                    ],
                ],
            ],
            'responses' => [
                '200' => ['description' => 'The submission result, including a validation failure.', 'body' => ['$ref' => self::RESULT]],
                '404' => ['description' => 'No form has that ID.', 'body' => ['$ref' => self::ERROR]],
                '503' => ['description' => 'Contact Form 7 is not active.', 'body' => ['$ref' => self::ERROR]],
            ],
            'callback'  => [$this, 'handle_submission'],
        ]);
    }

    /**
     * What a submission answers with.
     *
     * A rejected submission is a 200 with a `validation_failed` status, because
     * that is Contact Form 7's own result rather than a transport error.
     *
     * @return array<string, mixed>
     */
    private static function result(): array
    {
        return [
            'type'        => 'object',
            'description' => 'The result Contact Form 7 returned for a submission.',
            'properties'  => [
                'status'         => [
                    'type'        => 'string',
                    'required'    => true,
                    'description' => 'Contact Form 7\'s status, for example "mail_sent", "validation_failed" or "mail_failed".',
                ],
                'message'        => ['type' => 'string', 'required' => true, 'description' => 'The message configured on the form for this status.'],
                'invalid_fields' => [
                    'type'     => 'array',
                    'required' => true,
                    'items'    => [
                        'type'       => 'object',
                        'properties' => [
                            'field'   => ['type' => 'string', 'required' => true],
                            'message' => ['type' => 'string', 'required' => true],
                        ],
                    ],
                ],
            ],
        ];
    }

    public function validate_form_id(int $form_id): true|WP_Error
    {
        if (! function_exists('wpcf7_contact_form')) {
            return new WP_Error(
                'cf7_not_active',
                'Contact Form 7 plugin is not active.',
                ['status' => 503]
            );
        }

        if (! wpcf7_contact_form($form_id)) {
            return new WP_Error(
                'cf7_form_not_found',
                sprintf('No Contact Form 7 form found with ID %d.', $form_id),
                ['status' => 404]
            );
        }

        return true;
    }

    public function handle_submission(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $form_id = (int) $request->get_param('form_id');
        $form    = wpcf7_contact_form($form_id);

        if (! $form) {
            return new WP_Error(
                'cf7_form_not_found',
                'Form not found.',
                ['status' => 404]
            );
        }

        $result = $this->submit_form($form, $this->extract_form_data($request));

        $cf7_status  = $result['status'] ?? 'unknown';

        return new WP_REST_Response(
            [
                'status'         => $cf7_status,
                'message'        => $result['message'] ?? '',
                'invalid_fields' => $this->format_invalid_fields($result['invalid_fields'] ?? []),
            ]
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function extract_form_data(WP_REST_Request $request): array
    {
        $body = $request->get_body_params();
        $json = $request->get_json_params();

        $data = array_merge($body ?: [], $json ?: []);

        unset($data['form_id']);

        return $data;
    }

    /**
     * @param array<string, mixed> $form_data
     * @return array<string, mixed>
     */
    private function submit_form(WPCF7_ContactForm $form, array $form_data): array
    {
        $original_post = $_POST;

        $_POST = array_merge($form_data, [
            '_wpcf7'                => $form->id(),
            '_wpcf7_version'        => defined('WPCF7_VERSION') ? WPCF7_VERSION : '',
            '_wpcf7_locale'         => get_locale(),
            '_wpcf7_unit_tag'       => 'wpcf7-f' . $form->id() . '-o1',
            '_wpcf7_container_post' => 0,
        ]);

        add_filter('wpcf7_skip_spam_check', '__return_true');

        $result = $form->submit();

        $_POST = $original_post;
        remove_filter('wpcf7_skip_spam_check', '__return_false');

        return $result;
    }

    /**
     * @param array<string, array{reason?: string, idref: string}> $invalid_fields
     * @return array<int, array{field: string, message: string}>
     */
    private function format_invalid_fields(array $invalid_fields): array
    {
        $formatted = [];

        foreach ($invalid_fields as $field_name => $error) {
            $formatted[] = [
                'field'   => sanitize_key($field_name),
                'message' => isset($error['reason']) ? wp_strip_all_tags($error['reason']) : '',
            ];
        }

        return $formatted;
    }
}
