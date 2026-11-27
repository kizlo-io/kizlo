<?php

namespace Kizlo\Modules\Auth;

final class Identity
{
    public function __construct(
        public readonly string $issuer,
        public readonly string $subject,
        public readonly ?string $email,
        public readonly bool $emailVerified,
        public readonly ?string $firstName = null,
        public readonly ?string $lastName = null,
    ) {}
}
