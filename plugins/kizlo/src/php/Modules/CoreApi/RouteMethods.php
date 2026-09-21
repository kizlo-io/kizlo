<?php

namespace Kizlo\Modules\CoreApi;

/**
 * Select the one documented method for each operation a REST handler serves.
 *
 * Core registers editable handlers for POST, PUT and PATCH. They all resolve to
 * one generated update operation, so both discovery and error registration must
 * choose the same representative method.
 *
 * ## One handler is one behaviour
 *
 * A handler entry carries one callback, so every method registered on it reaches
 * the same code. Core says which behaviour that is by naming the callback, and
 * {@see RouteIdentity::operation()} reads the name. A callback it does not
 * recognise is named by method instead, which splits an `EDITABLE` registration
 * on a collection-shaped path into a `create` under POST and an `update` under
 * PATCH: two published operations for one behaviour, and a POST that a caller
 * reads as "add one" while the handler replaces the lot. WooCommerce registers
 * `batch_items` and the Store API's `get_response` exactly that way.
 *
 * So the write verbs of an unrecognised handler collapse into the single
 * operation they are. `GET` and `DELETE` are left alone, a handler that
 * registers only POST still creates, and a route that registers `CREATABLE` and
 * `EDITABLE` as two entries keeps both operations, because two entries are two
 * callbacks and genuinely two behaviours.
 */
final class RouteMethods
{
    /** @var array<int, string> */
    private const PREFERRED = ['PATCH', 'POST', 'PUT', 'GET', 'DELETE'];

    /** @var array<int, string> */
    private const WRITES = ['POST', 'PUT', 'PATCH'];

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

        if (!RouteIdentity::recognizes($callback)) {
            $byOperation = self::collapseWrites($byOperation, $callback, $addresses);
        }

        $chosen = [];

        foreach ($byOperation as $operation => $methods) {
            $chosen[(string) $operation] = self::preferred($methods);
        }

        return $chosen;
    }

    /**
     * @param array<string, array<int, string>> $byOperation
     * @return array<string, array<int, string>>
     */
    private static function collapseWrites(array $byOperation, string $callback, bool $addresses): array
    {
        $writes = [];

        foreach ($byOperation as $methods) {
            $writes = [...$writes, ...array_values(array_intersect($methods, self::WRITES))];
        }

        // One write verb is already one operation, and an addressing path names
        // all three `update` in any case.
        if (count($writes) < 2) {
            return $byOperation;
        }

        $collapsed = [];

        foreach ($byOperation as $operation => $methods) {
            $rest = array_values(array_diff($methods, self::WRITES));

            if ($rest !== []) {
                $collapsed[(string) $operation] = $rest;
            }
        }

        $collapsed[RouteIdentity::operation(self::preferred($writes), $callback, $addresses)] = $writes;

        return $collapsed;
    }

    /**
     * @param array<int, string> $methods
     */
    private static function preferred(array $methods): string
    {
        foreach (self::PREFERRED as $preferred) {
            if (in_array($preferred, $methods, true)) {
                return $preferred;
            }
        }

        return (string) reset($methods);
    }
}
