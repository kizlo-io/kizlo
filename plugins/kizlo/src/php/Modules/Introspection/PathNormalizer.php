<?php

namespace Kizlo\Modules\Introspection;

/**
 * Turns a registered WordPress route into the readable path the contract emits.
 *
 * Routes reach registration as regex — `kizlo_route('/orders/:id')` expands to
 * `/orders/(?P<id>[a-zA-Z0-9_.%+-]+)` — which is unreadable in a contract and
 * useless to a client generator. Named groups collapse to `{id}` and the
 * parameter names come back so the operation can be checked against its declared
 * input.
 *
 * The regex is never consulted for a parameter's *type*. `{identifier}` on managed
 * content accepts a numeric id or a slug, so the declared input is the only source
 * of truth.
 */
class PathNormalizer
{
    /**
     * @return array{path: string, parameters: array<int, string>, errors: array<int, string>}
     */
    public static function normalize(string $route): array
    {
        $path       = '';
        $parameters = [];
        $errors     = [];

        $length = strlen($route);
        $i      = 0;

        while ($i < $length) {
            $char = $route[$i];

            if ($char !== '(') {
                $path .= $char;
                $i++;
                continue;
            }

            $end = self::matchingParen($route, $i);
            if ($end === null) {
                $errors[] = 'Route has an unbalanced group.';
                return ['path' => $path, 'parameters' => $parameters, 'errors' => $errors];
            }

            $group = substr($route, $i, $end - $i + 1);
            $name  = self::groupName($group);

            if ($name === null) {
                $errors[] = 'Route contains an unnamed group; every route parameter must be a named capture group.';
            } else {
                $path        .= '{' . $name . '}';
                $parameters[] = $name;
            }

            $i = $end + 1;
        }

        if (!str_starts_with($path, '/')) {
            $errors[] = 'Route must start with "/".';
        }

        if (str_contains($path, '//')) {
            $errors[] = 'Route must not contain an empty segment.';
        }

        if (preg_match('#^(?:/(?:\{[a-z_][a-z0-9_]*\}|[A-Za-z0-9._-]+))*$#', $path) !== 1) {
            $errors[] = sprintf('Route normalizes to "%s", which is not a valid path.', $path);
        }

        if (count($parameters) !== count(array_unique($parameters))) {
            $errors[] = 'Route declares the same parameter more than once.';
        }

        return ['path' => $path, 'parameters' => $parameters, 'errors' => $errors];
    }

    /** Index of the `)` closing the `(` at $start, accounting for nesting and escapes. */
    private static function matchingParen(string $route, int $start): ?int
    {
        $depth  = 0;
        $length = strlen($route);

        for ($i = $start; $i < $length; $i++) {
            $char = $route[$i];

            if ($char === '\\') {
                $i++;
                continue;
            }

            if ($char === '(') {
                $depth++;
            } elseif ($char === ')') {
                $depth--;
                if ($depth === 0) {
                    return $i;
                }
            }
        }

        return null;
    }

    /** The capture name of a group, or null when the group is unnamed or non-capturing. */
    private static function groupName(string $group): ?string
    {
        if (preg_match('/^\(\?P?[<\']([A-Za-z_][A-Za-z0-9_]*)[>\']/', $group, $matches) === 1) {
            return $matches[1];
        }
        return null;
    }
}
