<?php

namespace Kizlo\Modules\Introspection;

use InvalidArgumentException;
use WP_Error;
use WP_REST_Request;

/**
 * The work behind `kizlo_register_route()`, `kizlo_register_spec_route()` and
 * `kizlo_register_spec_schema()`.
 *
 * A runtime registration does three things at once: it registers the WordPress
 * endpoint, it turns the declared input into that endpoint's validation and
 * sanitization arguments, and it contributes the same normalized shape a
 * standalone spec route would. One declaration, no second `args` array to drift
 * out of step with it.
 *
 * Managed content comes in through {@see registerManaged()} instead. Those
 * declarations are per slug and are built too late for the load-time path, but
 * they get the same argument translation, which is the half that has to be true
 * of every route for the contract to mean anything.
 */
class RouteRegistrar
{
    /** Fields that describe the contract rather than the WordPress route. */
    private const SPEC_KEYS = ['id', 'operation', 'namespace', 'input', 'responses', 'summary', 'description', 'deprecated'];

    /**
     * @param array<string, mixed> $args
     */
    public static function registerRuntime(array $args, bool $core): void
    {
        $route = $args['route'] ?? '';

        if (!is_string($route) || $route === '') {
            _doing_it_wrong('kizlo_register_route', '"route" is required.', '1.0.0');
            return;
        }

        $describes = isset($args['id']);

        if (!$describes) {
            self::deferEndpoint($route, self::routeArgs($args), null);
            return;
        }

        $declaration = self::declaration($args, KIZLO_API_NAMESPACE);
        $input       = is_array($args['input'] ?? null) ? $args['input'] : [];

        if (isset($args['args'])) {
            self::fail(
                'kizlo_register_route',
                ['api_id' => (string) $args['id'], 'keyword' => 'args'],
                'An introspected route declares its parameters in "input"; the "args" array is redundant.',
            );
        }

        foreach (RuntimeKeywordScanner::ignored(RuntimeKeywordScanner::find($input)) as $hit) {
            self::fail(
                'kizlo_register_route',
                ['api_id' => (string) $args['id'], 'pointer' => $hit['pointer'], 'keyword' => $hit['keyword']],
                sprintf('"%s" is only run on a top-level input property; WordPress ignores it here.', $hit['keyword']),
            );
        }

        SpecStore::addRoute($declaration, $core);

        self::deferEndpoint($route, self::routeArgs($args), $input);
    }

    /**
     * Register the runtime half of a declaration that already describes itself.
     *
     * {@see ManagedContent} builds one declaration per managed slug and hands it
     * to the registry directly, so there is nothing to add to {@see SpecStore}
     * here — only the endpoint that declaration has been promising. Registration
     * happens immediately rather than on `rest_api_init`, because which slugs are
     * managed is only knowable once post types and taxonomies exist, which is to
     * say from inside that hook.
     *
     * @param array<string, mixed> $declaration
     */
    public static function registerManaged(array $declaration, callable $callback): void
    {
        $route = is_string($declaration['route'] ?? null) ? $declaration['route'] : '';
        $input = is_array($declaration['input'] ?? null) ? $declaration['input'] : [];

        self::registerEndpoint(
            $route,
            self::routeArgs(['methods' => $declaration['methods'] ?? [], 'callback' => $callback]),
            $input,
        );
    }

    /**
     * Describe a route this plugin does not own. No endpoint is registered, no
     * request is made, and nothing verifies that the described route exists —
     * the contract is a statement about someone else's API, taken on trust.
     *
     * @param array<string, mixed> $args
     */
    public static function registerSpec(array $args, bool $core): void
    {
        $id = $args['id'] ?? '';

        if (!is_string($id) || $id === '') {
            _doing_it_wrong('kizlo_register_spec_route', '"id" is required.', '1.0.0');
            return;
        }

        if (!is_string($args['namespace'] ?? null) || $args['namespace'] === '') {
            self::fail(
                'kizlo_register_spec_route',
                ['api_id' => $id, 'keyword' => 'namespace'],
                '"namespace" is required; a standalone spec has no namespace to inherit.',
            );
            return;
        }

        foreach (['callback', 'permission_callback', 'args'] as $key) {
            if (isset($args[$key])) {
                self::fail(
                    'kizlo_register_spec_route',
                    ['api_id' => $id, 'keyword' => $key],
                    sprintf('"%s" describes a runtime route; a standalone spec registers nothing.', $key),
                );
            }
        }

        $input = is_array($args['input'] ?? null) ? $args['input'] : [];

        foreach (RuntimeKeywordScanner::find($input) as $hit) {
            self::fail(
                'kizlo_register_spec_route',
                ['api_id' => $id, 'pointer' => $hit['pointer'], 'keyword' => $hit['keyword']],
                sprintf('"%s" describes a runtime route; a standalone spec registers nothing.', $hit['keyword']),
            );
        }

        SpecStore::addRoute(self::declaration($args, (string) $args['namespace']), $core);
    }

    /**
     * @param array<string, mixed> $schema
     */
    public static function registerSchema(string $id, array $schema, bool $core): void
    {
        if (!Spec::isValidSchemaId($id)) {
            self::fail(
                'kizlo_register_spec_schema',
                ['schema_id' => $id],
                'Schema IDs are global and must be vendor-qualified, for example "acme.widget".',
            );
            return;
        }

        if (Spec::isReservedId($id) && !$core) {
            self::fail(
                'kizlo_register_spec_schema',
                ['schema_id' => $id],
                'This ID prefix is reserved for Kizlo core.',
            );
            return;
        }

        SpecStore::addSchema($id, $schema, $core);
    }

    // ============================================================
    // INTERNALS
    // ============================================================

    /**
     * The contract half of a declaration, with executable callbacks removed. The
     * emitted document never carries a callable — it would not serialize, and it
     * would expose controller internals if it did.
     *
     * @param array<string, mixed> $args
     * @return array<string, mixed>
     */
    private static function declaration(array $args, string $namespace): array
    {
        $declaration = [
            'id'        => $args['id'] ?? '',
            'operation' => $args['operation'] ?? '',
            'namespace' => $namespace,
            'route'     => $args['route'] ?? '',
            'methods'   => $args['methods'] ?? [],
            'input'     => is_array($args['input'] ?? null) ? SchemaNormalizer::normalize($args['input']) : [],
            'responses' => $args['responses'] ?? [],
        ];

        foreach (['summary', 'description', 'deprecated'] as $key) {
            if (isset($args[$key])) {
                $declaration[$key] = $args[$key];
            }
        }

        return $declaration;
    }

    /**
     * @param array<string, mixed> $args
     * @return array<string, mixed>
     */
    private static function routeArgs(array $args): array
    {
        $routeArgs = array_diff_key($args, array_flip(array_merge(['route'], self::SPEC_KEYS)));

        $routeArgs['permission_callback'] = static function () {
            if (! current_user_can('manage_options')) {
                return new WP_Error(
                    'rest_forbidden',
                    'You do not have permission to access this endpoint.',
                    ['status' => 403]
                );
            }
            return true;
        };

        $callback = $routeArgs['callback'];

        $routeArgs['callback'] = static function (WP_REST_Request $request) use ($callback) {
            try {
                return $callback($request);
            } catch (InvalidArgumentException $e) {
                return new WP_Error('invalid_param', $e->getMessage(), ['status' => 400]);
            }
        };

        return $routeArgs;
    }

    /**
     * Arguments are translated at `rest_api_init` rather than now, so a `$ref`
     * resolves against every schema registered anywhere during plugin load
     * regardless of which loaded first.
     *
     * @param array<string, mixed>      $routeArgs
     * @param array<string, mixed>|null $input
     */
    private static function deferEndpoint(string $route, array $routeArgs, ?array $input): void
    {
        add_action('rest_api_init', static function () use ($route, $routeArgs, $input): void {
            self::registerEndpoint($route, $routeArgs, $input);
        });
    }

    /**
     * @param array<string, mixed>      $routeArgs
     * @param array<string, mixed>|null $input
     */
    private static function registerEndpoint(string $route, array $routeArgs, ?array $input): void
    {
        if ($input !== null) {
            // Coerced first, so a repairable declaration reaches WordPress in the
            // form it was meant to take: `'required' => 1` is enforced rather than
            // being treated as an unusable flag.
            $input    = SchemaCoercer::coerce($input);
            $schemas  = Registry::schemaMap();
            $critical = ArgTranslator::criticalErrors($input, $schemas);

            if ($critical !== []) {
                foreach ($critical as $message) {
                    self::fail(
                        'kizlo_register_route',
                        ['path' => $route, 'keyword' => 'input'],
                        sprintf('%s The endpoint was not registered, because it would have skipped its declared validation.', $message),
                    );
                }
                return;
            }

            $routeArgs['args'] = ArgTranslator::toArgs($input, $schemas);
        }

        register_rest_route(KIZLO_API_NAMESPACE, $route, $routeArgs);
    }

    /**
     * Report to the developer now and to `/introspect` later: a registration that
     * silently half-worked is what this whole contract exists to prevent.
     *
     * @param array<string, string> $location
     */
    private static function fail(string $function, array $location, string $message): void
    {
        _doing_it_wrong($function, esc_html($message), '1.0.0');

        SpecStore::addError($location, $message);
    }
}
