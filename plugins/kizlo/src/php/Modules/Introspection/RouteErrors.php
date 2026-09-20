<?php

namespace Kizlo\Modules\Introspection;

/**
 * Merges separately registered error codes into existing route declarations.
 *
 * A selector uses the REST namespace, readable path and one HTTP method.
 * Generated API IDs, operation names and WordPress route regexes are not
 * required to describe somebody else's handler.
 */
final class RouteErrors
{
    public const FILTER = 'kizlo_introspection_route_errors';

    /**
     * @param array<int, array{declaration: mixed, core: bool}> $declarations
     * @return array<int, array{declaration: mixed, core: bool}>
     */
    public static function apply(array $declarations, Diagnostics $diagnostics): array
    {
        /** @var mixed $contributed */
        $contributed = apply_filters(self::FILTER, []);

        if (!is_array($contributed)) {
            $diagnostics->error(
                ['keyword' => self::FILTER],
                sprintf('The "%s" filter must return a list of route error registrations.', self::FILTER),
            );
            return $declarations;
        }

        /** @var array<string, array{route: array{namespace: string, path: string, method: string}, errors: array<int, string>}> $registrations */
        $registrations = [];

        foreach (array_values($contributed) as $index => $entry) {
            $registration = self::registration($entry, (int) $index, $diagnostics);

            if ($registration === null) {
                continue;
            }

            $key = self::key($registration['route']);

            if (!isset($registrations[$key])) {
                $registrations[$key] = $registration;
                continue;
            }

            foreach ($registration['errors'] as $code) {
                if (in_array($code, $registrations[$key]['errors'], true)) {
                    self::duplicate($diagnostics, $registration['route'], $code);
                    continue;
                }

                $registrations[$key]['errors'][] = $code;
            }
        }

        /** @var array<string, array<int, int|string>> $candidates */
        $candidates = [];

        foreach ($declarations as $index => $entry) {
            $declaration = $entry['declaration'];

            if (!is_array($declaration)) {
                continue;
            }

            $selector = self::declarationSelector($declaration);

            if ($selector === null) {
                continue;
            }

            $candidates[self::key($selector)][] = $index;
        }

        foreach ($registrations as $key => $registration) {
            $route   = $registration['route'];
            $matches = $candidates[$key] ?? [];

            if (count($matches) === 0) {
                $diagnostics->error(
                    self::location($route),
                    sprintf('No introspected route matches %s %s in "%s".', $route['method'], $route['path'], $route['namespace']),
                );
                continue;
            }

            if (count($matches) !== 1) {
                $diagnostics->error(
                    self::location($route),
                    sprintf('More than one introspected route matches %s %s in "%s"; registered errors were not added.', $route['method'], $route['path'], $route['namespace']),
                );
                continue;
            }

            $index       = $matches[0];
            $declaration = $declarations[$index]['declaration'];
            $declared = $declaration['errors'] ?? [];

            if (!is_array($declared) || !array_is_list($declared)) {
                // Preserve the malformed declaration so its normal validator can
                // report the field rather than silently repairing it here.
                continue;
            }

            foreach ($registration['errors'] as $code) {
                if (in_array($code, $declared, true)) {
                    continue;
                }

                $declared[] = $code;
            }

            $declaration['errors'] = $declared;
            $declarations[$index]['declaration'] = $declaration;
        }

        return $declarations;
    }

    /**
     * @return array{route: array{namespace: string, path: string, method: string}, errors: array<int, string>}|null
     */
    private static function registration(mixed $entry, int $index, Diagnostics $diagnostics): ?array
    {
        $base = ['keyword' => self::FILTER, 'registration' => (string) $index];

        if (!is_array($entry) || !is_array($entry['route'] ?? null) || !array_key_exists('errors', $entry)) {
            $diagnostics->error(
                $base,
                'A route error registration must be an ["route" => [...], "errors" => [...]] entry.',
            );
            return null;
        }

        $route = self::selector($entry['route']);

        if ($route === null) {
            $diagnostics->error(
                array_merge($base, ['keyword' => 'route']),
                'A route error selector requires a valid "namespace", readable "/path" and one HTTP "method".',
            );
            return null;
        }

        $errors = $entry['errors'];

        if (!is_array($errors) || !array_is_list($errors)) {
            $diagnostics->error(
                self::location($route) + ['keyword' => 'errors'],
                'Registered route errors must be a list of non-empty strings.',
            );
            return null;
        }

        $clean = [];

        foreach ($errors as $code) {
            if (!is_string($code) || trim($code) === '') {
                $diagnostics->error(
                    self::location($route) + ['keyword' => 'errors'],
                    'Every registered route error must be a non-empty string.',
                );
                continue;
            }

            if (in_array($code, $clean, true)) {
                self::duplicate($diagnostics, $route, $code);
                continue;
            }

            $clean[] = $code;
        }

        if ($clean === []) {
            if ($errors === []) {
                $diagnostics->error(
                    self::location($route) + ['keyword' => 'errors'],
                    'At least one route error code is required.',
                );
            }

            return null;
        }

        return ['route' => $route, 'errors' => $clean];
    }

    /**
     * @param array<string, mixed> $raw
     * @return array{namespace: string, path: string, method: string}|null
     */
    private static function selector(array $raw): ?array
    {
        $namespace = $raw['namespace'] ?? null;
        $path      = $raw['path'] ?? null;
        $method    = $raw['method'] ?? null;

        if (!Spec::isValidNamespace($namespace)
            || !is_string($path)
            || array_key_exists('route', $raw)
            || !is_string($method)
        ) {
            return null;
        }

        $method = strtoupper(trim($method));

        if (!in_array($method, Spec::METHODS, true)) {
            return null;
        }

        $normalized = PathNormalizer::normalize($path);

        if ($normalized['errors'] !== [] || $normalized['path'] !== $path) {
            return null;
        }

        preg_match_all('/\{([a-z_][a-z0-9_]*)\}/', $path, $matches);

        if (count($matches[1]) !== count(array_unique($matches[1]))) {
            return null;
        }

        return ['namespace' => $namespace, 'path' => $path, 'method' => $method];
    }

    /** @param array<string, mixed> $declaration
     *  @return array{namespace: string, path: string, method: string}|null
     */
    private static function declarationSelector(array $declaration): ?array
    {
        $route = $declaration['route'] ?? null;

        if (!is_string($route)) {
            return null;
        }

        $normalized = PathNormalizer::normalize($route);

        if ($normalized['errors'] !== []) {
            return null;
        }

        return self::selector([
            'namespace' => $declaration['namespace'] ?? null,
            'path' => $normalized['path'],
            'method' => $declaration['method'] ?? null,
        ]);
    }

    /** @param array{namespace: string, path: string, method: string} $route */
    private static function key(array $route): string
    {
        return implode("\0", [$route['namespace'], $route['path'], $route['method']]);
    }

    /**
     * @param array{namespace: string, path: string, method: string} $route
     * @return array<string, string>
     */
    private static function location(array $route): array
    {
        return [
            'namespace' => $route['namespace'],
            'path'      => $route['path'],
            'method'    => $route['method'],
        ];
    }

    /** @param array{namespace: string, path: string, method: string} $route */
    private static function duplicate(Diagnostics $diagnostics, array $route, string $code): void
    {
        $diagnostics->error(
            self::location($route) + ['keyword' => 'errors'],
            sprintf('Error code "%s" is registered more than once for this route.', $code),
        );
    }
}
