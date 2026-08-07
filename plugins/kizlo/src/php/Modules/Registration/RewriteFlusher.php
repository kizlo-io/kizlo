<?php

namespace Kizlo\Modules\Registration;

/**
 * Coalesces rewrite-rule flushes.
 *
 * flush_rewrite_rules() is expensive, so registration mutations only mark the
 * rules dirty. The registrar flushes once on the next request after it has
 * registered every object — never on every request.
 */
class RewriteFlusher
{
    private const OPTION = 'kizlo_registration_flush_pending';

    /**
     * Mark rewrite rules as needing a flush on the next request.
     */
    public static function markDirty(): void
    {
        update_option(self::OPTION, true);
    }

    /**
     * Flush once if a mutation marked the rules dirty, then clear the flag.
     * Must run after all objects have been registered.
     */
    public static function flushIfPending(): void
    {
        if (get_option(self::OPTION)) {
            flush_rewrite_rules(false);
            delete_option(self::OPTION);
        }
    }
}
