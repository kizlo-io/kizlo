<?php

namespace Kizlo\Pos\Modules\Security;

final class SecurityError extends \RuntimeException
{
    public function __construct(string $message, public int $status = 400)
    {
        parent::__construct($message);
    }
}
