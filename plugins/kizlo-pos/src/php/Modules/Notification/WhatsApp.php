<?php

namespace Kizlo\Pos\Modules\Notification;

use Kizlo\Pos\Modules\Checkout\PaymentPage;

final class WhatsApp implements Channel
{
    public function id(): string { return 'whatsapp'; }
    public function label(): string { return 'WhatsApp'; }
    public function events(): array { return ['pos_payment_request']; }

    public function unavailable(\WC_Order $order, string $event): ?string
    {
        if (get_option('kizlo_pos_whatsapp', 'no') !== 'yes') return 'Enable WhatsApp payment requests in WooCommerce → Settings → Kizlo → POS.';
        if (!function_exists('kizlo_get_integrations') || !kizlo_get_integrations()->whatsapp->isConfigured()) return 'Configure WhatsApp in Kizlo → Integrations → WhatsApp.';
        return $order->get_billing_phone() !== '' ? null : 'Add the customer phone number with its country code.';
    }

    public function send(\WC_Order $order, string $event, string $delivery_id, array $context): array
    {
        if ($this->unavailable($order, $event) !== null) return ['status' => 'failed'];
        $amount = html_entity_decode(wp_strip_all_tags(wc_price($order->get_total(), ['currency' => $order->get_currency()])), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $message = sprintf('%s — payment request for order #%s', wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES), $order->get_order_number())
            . "\nTotal: " . $amount . "\nPay: " . PaymentPage::url($order);
        $result = kizlo_get_integrations()->whatsapp->sendText($order->get_billing_phone(), $message);
        return is_wp_error($result) ? ['status' => $result->get_error_data()['delivery_status'] ?? 'failed'] : $result;
    }
}
