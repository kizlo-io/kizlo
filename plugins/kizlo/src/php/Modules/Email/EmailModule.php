<?php

namespace Kizlo\Modules\Email;

use Kizlo\Modules\Email\EmailRepository;
use Kizlo\Modules\Introspection\CoreSchemas;
use WP_REST_Request;

class EmailModule
{
    private EmailRepository $email;

    public function __construct()
    {
        $this->email = new EmailRepository();
    }

    public function register(): void
    {

        kizlo_register_route([
            'id'        => 'email',
            'operation' => 'send',
            'method'    => 'POST',
            'route'     => '/email/send',
            'summary'   => 'Send an email through WordPress',
            'input'     => [
                'type'       => 'object',
                'properties' => [
                    'to' => [
                        // A union rather than an array of strings, because the
                        // sanitizer accepts a single address and wraps it.
                        'required'          => true,
                        'description'       => 'Recipient address, or a list of them.',
                        'anyOf'             => [
                            ['type' => 'string', 'format' => 'email'],
                            ['type' => 'array', 'items' => ['type' => 'string', 'format' => 'email']],
                        ],
                        'validate_callback' => static function ($value): bool {
                            $addresses = is_array($value) ? $value : [$value];
                            foreach ($addresses as $address) {
                                if (! is_string($address) || ! is_email($address)) {
                                    return false;
                                }
                            }
                            return true;
                        },
                        'sanitize_callback' => static fn($value): array => array_map('sanitize_email', is_array($value) ? $value : [$value]),
                    ],
                    'subject' => [
                        'type'              => 'string',
                        'required'          => true,
                        'description'       => 'Email subject line.',
                        'validate_callback' => static fn($v) => is_string($v) && $v !== '',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'body' => [
                        'type'              => 'string',
                        'required'          => true,
                        'description'       => 'Email body. Plain text or HTML.',
                        'validate_callback' => static fn($v) => is_string($v) && $v !== '',
                        'sanitize_callback' => 'wp_kses_post',
                    ],
                ],
            ],
            'errors'    => ['kizlo_email_failed'],
            'responses' => [
                '200' => [
                    'description' => 'The email was handed to WordPress.',
                    'body'        => [
                        'type'       => 'object',
                        'properties' => [
                            'to'      => ['type' => 'array', 'required' => true, 'items' => ['type' => 'string', 'format' => 'email']],
                            'subject' => ['type' => 'string', 'required' => true],
                        ],
                    ],
                ],
                '400' => ['description' => 'An address, the subject or the body was rejected.', 'body' => ['$ref' => CoreSchemas::ERROR]],
                '500' => ['description' => 'WordPress could not send the email.', 'body' => ['$ref' => CoreSchemas::ERROR]],
            ],
            'callback'  => [$this, 'sendEmailApiCallback'],
        ]);
    }

    public function sendEmailApiCallback(WP_REST_Request $request)
    {

        $to      = $request->get_param('to');
        $subject = $request->get_param('subject');
        $body    = $request->get_param('body');

        $data = $this->email->send($to, $subject, $body);

        return rest_ensure_response($data);
    }
}
