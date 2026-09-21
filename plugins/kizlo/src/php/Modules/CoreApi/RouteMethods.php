<?php

namespace Kizlo\Modules\CoreApi;

/**
 * Select the one documented method for each operation a REST handler serves.
 *
 * Core registers editable handlers for POST, PUT and PATCH. They all resolve to
 * one generated update operation, so both discovery and error registration must
 * choose the same representative method.
 */
final class RouteMethods
{
    /** @var array<int, string> */
    private const PREFERRED = ['PATCH', 'POST', 'PUT', 'GET', 'DELETE'];

    /**
     * @param array<string, mixed> $handler
     * @return array<string, string>
     */
    public static function operations(array $handler, string $callback, bool $addresses): array
    {
        $byOperation = [];

        foreach (is_array($handler['methods'] ?? null) ? $handler['methods'] : [] as $method => $enabled) {
            if ($enabled !== true || !is_string($method)) {
                continue;
            }

            $byOperation[RouteIdentity::operation($method, $callback, $addresses)][] = $method;
        }

        $chosen = [];

        foreach ($byOperation as $operation => $methods) {
            foreach (self::PREFERRED as $preferred) {
                if (in_array($preferred, $methods, true)) {
                    $chosen[$operation] = $preferred;
                    continue 2;
                }
            }

            $chosen[$operation] = (string) reset($methods);
        }

        return $chosen;
    }
}
