<?php

namespace Kizlo\Modules\Introspection;

/**
 * Backing store for the two public contract registration helpers.
 *
 * The public helpers accept factories rather than resolved arrays. Registration
 * therefore costs one closure allocation on an ordinary request, and the work
 * behind a controller's schema methods only runs when {@see Registry::build()}
 * asks for the document. Schema factories referenced by a runtime route's input
 * are the exception: that one dependency graph is materialized at
 * `rest_api_init`, because WordPress needs it to validate the endpoint.
 *
 * Materialized entries contribute through the `kizlo_introspection_schemas` /
 * `kizlo_introspection_routes` filters like anyone else. What the store adds is
 * provenance: it fingerprints everything registered from inside the Kizlo
 * plugin, which is how the registry later tells a core registration into
 * `kizlo.*` from a third-party one.
 */
class SpecStore
{
    /** @var array<int, array{id: string, schema: array<string, mixed>}> */
    private static array $schemas = [];

    /** @var array<int, array<string, mixed>> */
    private static array $routes = [];

    /** @var array<string, array<int, array{derive: callable, trusted: bool}>> */
    private static array $schemaFactories = [];

    /** @var array<int, array{derive: callable, trusted: bool}> */
    private static array $routeFactories = [];

    /** @var array<string, true> Guards circular schema factory dependencies. */
    private static array $materializingSchemas = [];

    /** @var array<string, true> Fingerprints of entries registered from inside the plugin. */
    private static array $trusted = [];

    /** @var array<string, array{location: array<string, string>, message: string}> */
    private static array $errors = [];

    /**
     * What the plugin itself registered, captured the first time a test resets.
     *
     * @var array{
     *     schemas: array<int, array{id: string, schema: array<string, mixed>}>,
     *     routes: array<int, array<string, mixed>>,
     *     schemaFactories: array<string, array<int, array{derive: callable, trusted: bool}>>,
     *     routeFactories: array<int, array{derive: callable, trusted: bool}>,
     *     trusted: array<string, true>
     * }|null
     */
    private static ?array $baseline = null;

    private static bool $hooked = false;

    public static function addSchemaFactory(string $id, callable $derive, bool $trusted): void
    {
        self::$schemaFactories[$id][] = ['derive' => $derive, 'trusted' => $trusted];
    }

    public static function addRouteFactory(callable $derive, bool $trusted): void
    {
        self::$routeFactories[] = ['derive' => $derive, 'trusted' => $trusted];
    }

    /** Materialize everything the introspection document can publish. */
    public static function materialize(): void
    {
        foreach (array_keys(self::$schemaFactories) as $id) {
            self::materializeSchema($id);
        }

        $factories            = self::$routeFactories;
        self::$routeFactories = [];

        foreach ($factories as $entry) {
            try {
                $route = ($entry['derive'])();
            } catch (\Throwable $error) {
                self::addError(
                    ['keyword' => 'factory'],
                    sprintf('A route spec factory threw %s: %s', $error::class, $error->getMessage()),
                );
                continue;
            }

            if (!is_array($route)) {
                self::addError(['keyword' => 'factory'], 'A route spec factory must return an array.');
                continue;
            }

            RouteRegistrar::registerSpec($route, $entry['trusted']);
        }
    }

    /**
     * Materialize only the registered schemas a runtime input references.
     *
     * @param array<string, mixed> $schema
     * @return bool Whether a factory ran, so the caller knows its schema-map memo is stale.
     */
    public static function materializeReferences(array $schema): bool
    {
        $materialized = false;

        foreach (self::references($schema) as $id) {
            $materialized = self::materializeSchema($id) || $materialized;
        }

        return $materialized;
    }

    /**
     * @param array<string, mixed> $schema
     */
    public static function addSchema(string $id, array $schema, bool $trusted): void
    {
        self::hook();

        $entry = ['id' => $id, 'schema' => $schema];

        self::$schemas[] = $entry;

        if ($trusted) {
            self::$trusted[self::fingerprint('schema', $entry)] = true;
        }
    }

    /**
     * @param array<string, mixed> $operation A normalized operation.
     */
    public static function addRoute(array $operation, bool $trusted): void
    {
        self::hook();

        self::$routes[] = $operation;

        if ($trusted) {
            self::$trusted[self::fingerprint('route', $operation)] = true;
        }
    }

    /**
     * Record a failure raised outside the registry's own diagnostics bag, so
     * `/introspect` reports it alongside everything the registry finds. A
     * derivation runs on every build, so repeated location-message pairs are the
     * same failure rather than new diagnostics.
     *
     * @param array<string, string> $location
     */
    public static function addError(array $location, string $message): void
    {
        ksort($location, SORT_STRING);

        $error = ['location' => $location, 'message' => $message];

        self::$errors[self::fingerprint('error', $error)] = $error;
    }

    /**
     * @param array{id: string, schema: array<string, mixed>}|array<string, mixed> $entry
     */
    public static function isTrusted(string $kind, array $entry): bool
    {
        return isset(self::$trusted[self::fingerprint($kind, $entry)]);
    }

    public static function applyDiagnostics(Diagnostics $diagnostics): void
    {
        foreach (self::$errors as $error) {
            $diagnostics->error($error['location'], $error['message']);
        }
    }

    /**
     * Test seam: drop everything a test registered, keeping what the plugin
     * registered at load.
     *
     * Emptying the store outright is what this used to do, and it was only
     * harmless while nothing but tests contributed through it. Now that the
     * plugin's own routes arrive this way, and arrive once at load, emptying the
     * store would delete them for the rest of the process and leave every later
     * test building a document for a plugin that appears to serve nothing.
     *
     * The baseline is captured on the first call, which is the first test's
     * setUp: the plugin has finished loading and no test has registered yet. The
     * filters are re-armed on the way out, because WordPress restores its hooks
     * between tests and would otherwise leave the baseline in the store with
     * nothing to publish it.
     */
    public static function reset(): void
    {
        self::$baseline ??= [
            'schemas'         => self::$schemas,
            'routes'          => self::$routes,
            'schemaFactories' => self::$schemaFactories,
            'routeFactories'  => self::$routeFactories,
            'trusted'         => self::$trusted,
        ];

        self::$schemas             = self::$baseline['schemas'];
        self::$routes              = self::$baseline['routes'];
        self::$schemaFactories     = self::$baseline['schemaFactories'];
        self::$routeFactories      = self::$baseline['routeFactories'];
        self::$trusted             = self::$baseline['trusted'];
        self::$errors              = [];
        self::$materializingSchemas = [];
        self::$hooked              = false;

        self::hook();
    }

    /**
     * A file in the plugin's own source tree is core; anything else is a
     * third-party contribution and cannot claim a reserved ID prefix.
     *
     * Scoped to `src/` rather than the plugin root so the rule is exactly "code
     * this plugin ships", which also leaves the test suite on the third-party
     * side of the boundary it is testing.
     */
    public static function isCoreFile(mixed $file): bool
    {
        if (!is_string($file) || $file === '' || !defined('KIZLO_PATH')) {
            return false;
        }

        return str_starts_with(wp_normalize_path($file), wp_normalize_path(KIZLO_PATH . 'src/'));
    }

    /** True when the caller of the calling function sits inside the Kizlo plugin. */
    public static function callerIsCore(): bool
    {
        $frames = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2);

        return self::isCoreFile($frames[1]['file'] ?? null);
    }

    private static function hook(): void
    {
        if (self::$hooked) {
            return;
        }

        self::$hooked = true;

        add_filter('kizlo_introspection_schemas', static function (array $schemas): array {
            return array_merge($schemas, self::$schemas);
        });

        add_filter('kizlo_introspection_routes', static function (array $routes): array {
            return array_merge($routes, self::$routes);
        });
    }

    private static function materializeSchema(string $id): bool
    {
        if (!isset(self::$schemaFactories[$id]) || isset(self::$materializingSchemas[$id])) {
            return false;
        }

        $factories = self::$schemaFactories[$id];
        unset(self::$schemaFactories[$id]);

        self::$materializingSchemas[$id] = true;

        foreach ($factories as $entry) {
            try {
                $schema = ($entry['derive'])();
            } catch (\Throwable $error) {
                self::addError(
                    ['schema_id' => $id, 'keyword' => 'factory'],
                    sprintf('The schema factory threw %s: %s', $error::class, $error->getMessage()),
                );
                continue;
            }

            if (!is_array($schema)) {
                self::addError(
                    ['schema_id' => $id, 'keyword' => 'factory'],
                    'A route schema factory must return an array.',
                );
                continue;
            }

            RouteRegistrar::registerSchema($id, $schema, $entry['trusted']);

            foreach (self::references($schema) as $reference) {
                self::materializeSchema($reference);
            }
        }

        unset(self::$materializingSchemas[$id]);

        return true;
    }

    /**
     * @param array<array-key, mixed> $schema
     * @return array<int, string>
     */
    private static function references(array $schema): array
    {
        $references = [];

        foreach ($schema as $key => $value) {
            if (($key === '$ref' || $key === '$extends') && is_string($value)) {
                $references[] = $value;
                continue;
            }

            if (is_array($value)) {
                array_push($references, ...self::references($value));
            }
        }

        return array_values(array_unique($references));
    }

    /**
     * @param array<string, mixed> $entry
     */
    private static function fingerprint(string $kind, array $entry): string
    {
        return hash('sha256', $kind . '|' . Document::encode($entry));
    }
}
