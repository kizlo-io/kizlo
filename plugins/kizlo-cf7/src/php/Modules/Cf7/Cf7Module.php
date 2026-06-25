<?php

namespace Kizlo\Cf7\Modules\Cf7;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WPCF7_ContactForm;

/**
 * Handles CF7 form submission via the Kizlo REST API.
 *
 * @since 1.0.0
 */
class Cf7Module
{
    /**
     * Boot the service — register hooks.
     *
     * @since 1.0.0
     */
    public function register(): void
    {
        kizlo_register_route([
            'methods'   => 'POST',
            'route'     => kizlo_route('/cf7/:form_id'),
            'callback'  => [$this, 'handle_submission'],
            'args'      => [
                'form_id' => [
                    'description'       => 'The ID of the Contact Form 7 form.',
                    'type'              => 'integer',
                    'required'          => true,
                    'sanitize_callback' => 'absint',
                    'validate_callback' => [$this, 'validate_form_id'],
                ],
            ],
        ]);
    }

    /**
     * Validate that the given form ID corresponds to a published CF7 form.
     *
     * @since 1.0.0
     *
     * @param int $form_id The form ID to validate.
     * @return true|WP_Error
     */
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
                /* translators: %d: form ID */
                sprintf('No Contact Form 7 form found with ID %d.', $form_id),
                ['status' => 404]
            );
        }

        return true;
    }

    /**
     * Handle a CF7 form submission via the REST API.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request Incoming REST request.
     * @return WP_REST_Response|WP_Error
     */
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
     * Extract and merge field data from the REST request body.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request
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
     * Populate $_POST with CF7-expected keys and run the submission pipeline.
     * Restores the original $_POST afterwards.
     *
     * @since 1.0.0
     *
     * @param WPCF7_ContactForm    $form
     * @param array<string, mixed> $form_data
     * @return array<string, mixed> CF7 submission result.
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

        // Bypass spam ONLY after captcha passes
        add_filter('wpcf7_skip_spam_check', '__return_true');

        $result = $form->submit();

        // Clean up
        $_POST = $original_post;
        remove_filter('wpcf7_skip_spam_check', '__return_false');

        return $result;
    }

    /**
     * Normalize CF7's raw invalid-fields array into a cleaner API shape.
     *
     * @since 1.0.0
     *
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
