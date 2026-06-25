<?php

namespace Kizlo\Modules\Email;

use Kizlo\Modules\Email\EmailRepository;
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
            'methods'   => 'POST',
            'access'    => 'admin',
            'route'     => '/email/send',
            'callback'  => [$this, 'sendEmailApiCallback'],
            'args' => [
                'to' => [
                    'required'          => true,
                    'description'       => 'Recipient address(es).',
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
                    'required'          => true,
                    'type'              => 'string',
                    'description'       => 'Email subject line.',
                    'validate_callback' => static fn($v) => is_string($v) && $v !== '',
                    'sanitize_callback' => 'sanitize_text_field',
                ],
                'body' => [
                    'required'          => true,
                    'type'              => 'string',
                    'description'       => 'Email body. Plain text or HTML.',
                    'validate_callback' => static fn($v) => is_string($v) && $v !== '',
                    'sanitize_callback' => 'wp_kses_post',
                ],
            ],
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
