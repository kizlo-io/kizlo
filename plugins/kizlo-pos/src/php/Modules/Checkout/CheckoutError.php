<?php

namespace Kizlo\Pos\Modules\Checkout;

final class CheckoutError extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400, public readonly array $details = [])
    {
        parent::__construct($message);
    }
}
