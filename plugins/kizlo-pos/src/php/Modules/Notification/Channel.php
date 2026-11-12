<?php

namespace Kizlo\Pos\Modules\Notification;

/** Implementations own their credentials, recipient policy and remote delivery receipts. */
interface Channel
{
    public function id(): string;
    public function label(): string;
    /** Stable Woo notification hook names, or pos_payment_request. */
    public function events(): array;
    /** Null when available; otherwise an actionable reason. */
    public function unavailable(\WC_Order $order, string $event): ?string;
    /** accepted/sent/failed/unknown, optional provider_id; use delivery_id for provider idempotency. */
    public function send(\WC_Order $order, string $event, string $delivery_id, array $context): array;
}
