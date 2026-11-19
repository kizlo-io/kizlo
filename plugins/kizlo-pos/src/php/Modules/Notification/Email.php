<?php

namespace Kizlo\Pos\Modules\Notification;

use Kizlo\Pos\Modules\Checkout\PaymentPage;

final class Email implements Channel
{
    public function id(): string { return 'email'; }
    public function label(): string { return 'Email'; }
    public function events(): array { return ['pos_payment_request']; }
    public function unavailable(\WC_Order $order, string $event): ?string
    {
        return is_email($order->get_billing_email()) && !str_ends_with(strtolower($order->get_billing_email()), '.invalid') ? null : 'Add a real customer email address.';
    }
    public function send(\WC_Order $order, string $event, string $delivery_id, array $context): array
    {
        PaymentPage::url($order);
        $result = null;
        $observe = static function ($success, $email_id, $email) use (&$result, $order) {
            if ($email_id === 'customer_invoice' && $email->object instanceof \WC_Order && $email->object->get_id() === $order->get_id()) $result = (bool) $success;
        };
        add_action('woocommerce_email_sent', $observe, 10, 3);
        try { WC()->mailer()->customer_invoice($order); }
        finally { remove_action('woocommerce_email_sent', $observe, 10); }
        return ['status' => $result === true ? 'accepted' : ($result === false ? 'failed' : 'unknown')];
    }
}
