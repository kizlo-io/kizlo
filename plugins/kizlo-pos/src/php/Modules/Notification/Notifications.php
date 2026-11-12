<?php

namespace Kizlo\Pos\Modules\Notification;

use Kizlo\Pos\Modules\Checkout\CheckoutError;
use Kizlo\Pos\Modules\Checkout\PaymentPage;
use Kizlo\Pos\Support\Lock;

final class Notifications
{
    public static function channels(): array
    {
        $channels = [];
        foreach (apply_filters('kizlo_pos_notification_channels', [new Email()]) as $channel) {
            if ($channel instanceof Channel && preg_match('/\A[a-z][a-z0-9_-]{0,79}\z/D', $channel->id()) && !isset($channels[$channel->id()])) $channels[$channel->id()] = $channel;
        }
        return $channels;
    }

    public static function catalog(?\WC_Order $order = null): array
    {
        $result = [];
        foreach (self::channels() as $channel) if (in_array('pos_payment_request', $channel->events(), true)) {
            try { $reason = $order ? $channel->unavailable($order, 'pos_payment_request') : null; }
            catch (\Throwable $error) { $reason = 'This channel is temporarily unavailable.'; }
            $result[] = ['id' => $channel->id(), 'label' => $channel->label(), 'unavailable' => $reason];
        }
        return $result;
    }

    public function register(): void
    {
        add_action('init', [$this, 'bridge'], 50);
        add_action('kizlo_pos_deliver_notification', [self::class, 'deliver'], 10, 2);
    }

    public function bridge(): void
    {
        $actions = apply_filters('woocommerce_email_actions', []);
        // WooCommerce's built-in list is not exposed as a getter; follow its registered order notification hooks.
        global $wp_filter;
        foreach (array_keys($wp_filter) as $hook) {
            if (str_starts_with($hook, 'woocommerce_order_status_') || in_array($hook, ['woocommerce_order_fully_refunded', 'woocommerce_order_partially_refunded', 'woocommerce_new_customer_note'], true)) $actions[] = $hook;
        }
        $actions = array_unique((array) apply_filters('kizlo_pos_order_notification_triggers', $actions));
        foreach ($actions as $hook) {
            if (!is_string($hook) || str_ends_with($hook, '_notification') || (!str_starts_with($hook, 'woocommerce_order_') && $hook !== 'woocommerce_new_customer_note')) continue;
            add_action($hook . '_notification', static function (...$args) use ($hook) {
                $first = $args[0] ?? null;
                $id = is_array($first) ? ($first['order_id'] ?? 0) : ($first instanceof \WC_Order ? $first->get_id() : $first);
                $order = is_numeric($id) ? wc_get_order((int) $id) : false;
                if (!$order) return;
                $context = ['trigger' => $hook];
                if (is_array($first)) $context['note_id'] = $first['customer_note_id'] ?? null;
                if (str_contains($hook, 'refunded')) $context['refund_id'] = is_numeric($args[1] ?? null) ? (int) $args[1] : null;
                $event = wp_generate_uuid4();
                foreach (self::channels() as $channel) {
                    try {
                        if (in_array($hook, $channel->events(), true) && $channel->unavailable($order, $hook) === null) self::queue($order, $channel, $hook, $event, $context);
                    } catch (\Throwable $error) {
                        wc_get_logger()->error('An order-notification channel could not be queued.', ['source' => 'kizlo-pos']);
                    }
                }
            }, 20, 10);
        }
    }

    public static function request(\WC_Order $order, string $channelId, string $requestId): array
    {
        $channel = self::channels()[$channelId] ?? null;
        if (!$channel || !in_array('pos_payment_request', $channel->events(), true)) throw new CheckoutError('This notification channel is not installed.');
        $reason = $channel->unavailable($order, 'pos_payment_request');
        if ($reason !== null) throw new CheckoutError($reason);
        return self::queue($order, $channel, 'pos_payment_request', $requestId, []);
    }

    private static function queue(\WC_Order $order, Channel $channel, string $event, string $eventId, array $context): array
    {
        $id = hash('sha256', $order->get_id() . ':' . $channel->id() . ':' . $event . ':' . $eventId);
        $key = 'kizlo_pos_delivery_' . $id;
        $delivery = ['id' => $id, 'channel' => $channel->id(), 'event' => $event, 'order_id' => $order->get_id(), 'status' => 'queued', 'context' => $context,
            'contact_hash' => hash_hmac('sha256', $order->get_billing_email() . ':' . $order->get_billing_phone(), wp_salt('nonce'))];
        if (!add_option($key, $delivery, '', false)) return (array) get_option($key);
        self::record($order->get_id(), $delivery);
        if (!function_exists('as_enqueue_async_action') || !as_enqueue_async_action('kizlo_pos_deliver_notification', [$order->get_id(), $id], 'kizlo-pos', true)) {
            $delivery['status'] = 'failed'; update_option($key, $delivery, false);
            self::record($order->get_id(), $delivery);
            throw new CheckoutError('The notification could not be queued.', 503);
        }
        return $delivery;
    }

    private static function record(int $orderId, array $delivery): void
    {
        Lock::run('deliveries:' . $orderId, static function () use ($orderId, $delivery): void {
            $order = wc_get_order($orderId);
            if (!$order) return;
            $deliveries = $order->get_meta('_kizlo_pos_deliveries') ?: [];
            $deliveries[$delivery['id']] = ['channel' => $delivery['channel'], 'event' => $delivery['event'], 'status' => $delivery['status']];
            $order->update_meta_data('_kizlo_pos_deliveries', array_slice($deliveries, -50, null, true));
            $order->save();
        });
    }

    public static function deliver(int $orderId, string $id): void
    {
        Lock::run('delivery:' . $id, static function () use ($orderId, $id): void {
            $key = 'kizlo_pos_delivery_' . $id;
            wp_cache_delete($key, 'options');
            $delivery = get_option($key);
            if (!is_array($delivery) || $delivery['status'] !== 'queued' || $delivery['order_id'] !== $orderId) return;
            $order = wc_get_order($orderId);
            $channel = self::channels()[$delivery['channel']] ?? null;
            if (!$order) return;
            if (!$channel) {
                $delivery['status'] = 'failed'; update_option($key, $delivery, false);
                self::record($orderId, $delivery);
                return;
            }
            $reason = $channel->unavailable($order, $delivery['event']);
            if (!hash_equals($delivery['contact_hash'], hash_hmac('sha256', $order->get_billing_email() . ':' . $order->get_billing_phone(), wp_salt('nonce')))) $reason = 'Customer contact details changed after this message was queued.';
            if ($delivery['event'] === 'pos_payment_request' && (!$order->needs_payment() || (int) $order->get_meta('_kizlo_pos_payment_expires') < time())) $reason = 'This payment request is no longer payable.';
            $delivery['status'] = $reason ? 'failed' : 'unknown';
            update_option($key, $delivery, false);
            self::record($orderId, $delivery);
            if (!$reason) {
                try {
                    $result = $channel->send($order, $delivery['event'], $id, $delivery['context']);
                    $delivery['status'] = in_array($result['status'] ?? '', ['accepted', 'sent', 'failed', 'unknown'], true) ? $result['status'] : 'unknown';
                    if (is_string($result['provider_id'] ?? null)) $delivery['provider_id'] = substr(sanitize_text_field($result['provider_id']), 0, 200);
                } catch (\Throwable $error) { $delivery['status'] = 'unknown'; }
            }
            update_option($key, $delivery, false);
            self::record($orderId, $delivery);
        });
    }

    /** Called by a trusted channel's verified provider callback, never by unauthenticated form data. */
    public static function report(string $channel, string $id, string $status, ?string $providerId = null): void
    {
        if (!preg_match('/\A[a-f0-9]{64}\z/D', $id) || !in_array($status, ['accepted', 'sent', 'failed', 'unknown'], true)) throw new \InvalidArgumentException('Invalid delivery report.');
        Lock::run('delivery:' . $id, static function () use ($channel, $id, $status, $providerId): void {
            $key = 'kizlo_pos_delivery_' . $id;
            wp_cache_delete($key, 'options');
            $delivery = get_option($key);
            if (!is_array($delivery) || $delivery['channel'] !== $channel || $delivery['status'] === 'sent') return;
            $delivery['status'] = $status;
            if ($providerId !== null) $delivery['provider_id'] = substr(sanitize_text_field($providerId), 0, 200);
            update_option($key, $delivery, false);
            self::record($delivery['order_id'], $delivery);
        });
    }
}
