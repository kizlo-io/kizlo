<?php

namespace Kizlo\Modules\Email;

use WP_Error;

class EmailRepository
{
    public function send(array $to, string $subject, string $body): array | WP_Error
    {
        $sent = wp_mail($to, $subject, $body, ['Content-Type: text/html; charset=UTF-8']);

        if (! $sent) {
            return new WP_Error(
                'kizlo_email_failed',
                'The email could not be sent. Please check your server mail configuration.',
                ['status' => 500]
            );
        }

        return ['to' => $to, 'subject' => $subject];
    }
}
