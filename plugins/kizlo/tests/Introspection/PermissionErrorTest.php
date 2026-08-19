<?php

namespace Kizlo\Tests\Introspection;

use ReflectionClass;
use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Server;
use WP_REST_Users_Controller;
use Kizlo\Modules\Introspection\CoreControllers;
use Kizlo\Modules\Introspection\OperationErrors;

/**
 * A `kizlo/v1` route cannot answer a code core only raises from a permission check.
 *
 * {@see \Kizlo\Modules\Introspection\RouteRegistrar::routeArgs()} gives every
 * Kizlo-owned route one `permission_callback`, a `manage_options` check, and the
 * handler then calls the controller's data method directly. WordPress calls
 * `get_items_permissions_check()` and its siblings when it dispatches its own
 * route, and nothing dispatches these, so those methods never run and every code
 * whose only raise site is inside one is a promise the route cannot keep.
 *
 * {@see ContextTest} held one instance of this, `rest_forbidden_context`. This is
 * the general rule, and it is checked against core's source rather than a list:
 * for each declared code, every raise site in the serving controller and its
 * parents is located and at least one has to sit outside a `*_permissions_check()`
 * method.
 *
 * Reading like a permission error is not the same as being one, and the sweep is
 * how the difference is told. `rest_user_cannot_delete_post` is raised inside
 * `delete_item()`, `rest_cannot_delete` when `wp_delete_term()` or
 * `wp_delete_user()` fails, and `rest_forbidden_status` from the `status`
 * sanitizer the derived arguments carry onto the route. All three stay declared,
 * and {@see self::test_the_codes_that_only_read_like_permission_checks_stay}
 * names them.
 */
class PermissionErrorTest extends IntrospectionTestCase
{
    /** @var array<string, array<int, string>> */
    private array $memo = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedSettings();
        $this->actingAsAdmin();
    }

    // ============================================================
    // THE SWEEP
    // ============================================================

    public function test_no_kizlo_route_declares_a_code_only_a_permission_check_raises(): void
    {
        $swept = 0;

        foreach ($this->kizloOperations() as $where => $operation) {
            $controller = $this->controllerFor($this->apiIdOf($where));

            if ($controller === null) {
                continue;
            }

            foreach ($this->declaredCodes($operation) as $code) {
                $sites = $this->raiseSites($code, $controller);

                // No raise site in the controller chain means the code is Kizlo's
                // own, or core raises it somewhere this sweep has no opinion on.
                if ($sites === []) {
                    continue;
                }

                $swept++;

                $this->assertNotEmpty(
                    array_filter($sites, static fn(?string $fn): bool => $fn === null || !str_ends_with($fn, '_permissions_check')),
                    sprintf(
                        '"%s" declares "%s", which %s only raises from %s.',
                        $where,
                        $code,
                        $controller::class,
                        implode(', ', array_map(static fn(?string $fn): string => $fn . '()', array_unique(array_values($sites)))),
                    ),
                );
            }
        }

        // A sweep that matched nothing would pass silently.
        $this->assertGreaterThan(20, $swept, 'The sweep found almost no core codes to check, so it is not looking where it thinks.');
    }

    /**
     * The sweep only sees an operation whose API is paired with a controller, so
     * a managed API added without that pairing would pass by being skipped. This
     * is what fails instead.
     */
    public function test_every_kizlo_route_backed_by_a_core_controller_is_swept(): void
    {
        $raised = $this->codesCoreRaises();

        foreach ($this->kizloOperations() as $where => $operation) {
            $apiId = $this->apiIdOf($where);

            if ($this->controllerFor($apiId) !== null) {
                continue;
            }

            foreach ($this->declaredCodes($operation) as $code) {
                $this->assertNotContains(
                    $code,
                    $raised,
                    sprintf('"%s" declares "%s", which a core controller raises, but "%s" is paired with no controller.', $where, $code, $apiId),
                );
            }
        }
    }

    // ============================================================
    // WHAT THAT REMOVES, AND WHAT IT DOES NOT
    // ============================================================

    /**
     * The half that is easy to assume. Same user, same request, opposite answers:
     * core's own route refuses the create, and the managed route serves it,
     * because the check that refuses is never reached.
     */
    public function test_a_managed_create_cannot_raise_what_cores_own_route_does(): void
    {
        add_role('kizlo_permission_test', 'Kizlo Permission Test', ['read' => true, 'manage_options' => true]);
        wp_set_current_user(self::factory()->user->create(['role' => 'kizlo_permission_test']));

        $server = $this->boot();

        $core = $this->dispatch($server, '/wp/v2/posts', ['title' => 'probe']);
        $this->assertSame('rest_cannot_create', $core->get_data()['code']);

        $managed = $this->dispatch($server, '/kizlo/v1/post-types/post', ['title' => 'probe']);
        $this->assertSame(201, $managed->get_status());

        remove_role('kizlo_permission_test');
    }

    /**
     * Three codes that read as permission failures and are raised from the data
     * path, so the sweep has to keep them and the contract still declares them.
     *
     * @dataProvider survivingCodeProvider
     */
    public function test_the_codes_that_only_read_like_permission_checks_stay(string $where, string $code): void
    {
        $operations = $this->kizloOperations();

        $this->assertArrayHasKey($where, $operations);
        $this->assertContains($code, $this->declaredCodes($operations[$where]));

        $controller = $this->controllerFor($this->apiIdOf($where));
        $this->assertNotNull($controller);

        $this->assertNotEmpty(
            array_filter($this->raiseSites($code, $controller), static fn(?string $fn): bool => $fn === null || !str_ends_with($fn, '_permissions_check')),
            sprintf('"%s" is declared on "%s" but every raise site is a permission check after all.', $code, $where),
        );
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function survivingCodeProvider(): array
    {
        return [
            'a post delete refused by check_delete_permission' => ['post-types.post /post-types/post/{identifier} delete', 'rest_user_cannot_delete_post'],
            'a term delete wp_delete_term refuses'             => ['taxonomies.category /taxonomies/category/{identifier} delete', 'rest_cannot_delete'],
            'a status the list sanitizer refuses'              => ['post-types.post /post-types/post list', 'rest_forbidden_status'],
        ];
    }

    /**
     * `rest_forbidden_status` survives for a reason worth pinning. The check that
     * raises it lives in a `sanitize_callback` rather than in a permission check,
     * and `sanitize_callback` is a keyword {@see \Kizlo\Modules\Introspection\Spec}
     * treats as part of a schema, so the derived arguments carry core's own
     * sanitizer onto the managed route instead of replacing it with the default.
     *
     * Core wraps a sanitizer's failure in `rest_invalid_param` and reports the
     * original under `details`, on its own route as much as on this one, so the
     * two routes are compared rather than a shape being asserted from memory.
     */
    public function test_the_managed_list_refuses_a_forbidden_status_the_way_cores_own_route_does(): void
    {
        add_role('kizlo_permission_test', 'Kizlo Permission Test', ['read' => true, 'manage_options' => true]);
        wp_set_current_user(self::factory()->user->create(['role' => 'kizlo_permission_test']));

        $server = $this->boot();

        $args = $this->readArgs($server, '/kizlo/v1/post-types/post');

        $this->assertSame('sanitize_post_statuses', $args['status']['sanitize_callback'][1]);

        $core    = $this->get($server, '/wp/v2/posts', ['status' => 'draft']);
        $managed = $this->get($server, '/kizlo/v1/post-types/post', ['status' => 'draft']);

        $this->assertSame($core->get_status(), $managed->get_status());
        $this->assertSame($core->get_data()['code'], $managed->get_data()['code']);
        $this->assertSame(
            $core->get_data()['data']['details']['status']['code'],
            $managed->get_data()['data']['details']['status']['code'],
        );
        $this->assertSame('rest_forbidden_status', $managed->get_data()['data']['details']['status']['code']);

        remove_role('kizlo_permission_test');
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * Every operation this plugin serves, keyed by where it is.
     *
     * {@see \Kizlo\Modules\Introspection\SpecStore::reset()} restores the baseline
     * captured at plugin boot rather than emptying the store, so the plugin's own
     * registrations are already here and managed content is rebuilt per document.
     *
     * @return array<string, array<string, mixed>>
     */
    private function kizloOperations(): array
    {
        $found = [];

        foreach ($this->document()['apis'] as $apiId => $api) {
            if ($api['namespace'] !== KIZLO_API_NAMESPACE) {
                continue;
            }

            foreach ($api['paths'] as $path => $operations) {
                foreach ($operations as $name => $operation) {
                    $found[sprintf('%s %s %s', $apiId, $path, $name)] = $operation;
                }
            }
        }

        return $found;
    }

    private function apiIdOf(string $where): string
    {
        return strstr($where, ' ', true) ?: $where;
    }

    /**
     * The codes an operation declares on its own account.
     *
     * {@see OperationErrors::SHARED} is dropped because those come from the guard
     * in front of every route rather than from the controller, and core raises
     * some of them from permission checks it does run.
     *
     * @param array<string, mixed> $operation
     * @return array<int, string>
     */
    private function declaredCodes(array $operation): array
    {
        $errors = is_array($operation['errors'] ?? null) ? $operation['errors'] : [];

        return array_values(array_diff($errors, OperationErrors::SHARED));
    }

    /**
     * The controller a Kizlo-served API calls into, or null when it serves itself.
     *
     * The pairing is what {@see \Kizlo\Modules\PostType\PostTypeApi},
     * {@see \Kizlo\Modules\Taxonomy\TaxonomyApi} and {@see \Kizlo\Modules\User\UserApi}
     * actually do, read the same way {@see CoreControllers} reads it so a post
     * type registered with a controller of its own is checked against that one.
     */
    private function controllerFor(string $apiId): ?WP_REST_Controller
    {
        if (str_starts_with($apiId, 'post-types.')) {
            return CoreControllers::forPostType(substr($apiId, strlen('post-types.')));
        }

        if (str_starts_with($apiId, 'taxonomies.')) {
            return CoreControllers::forTaxonomy(substr($apiId, strlen('taxonomies.')));
        }

        return $apiId === 'users' ? new WP_REST_Users_Controller() : null;
    }

    /**
     * Where a controller and its parents raise a code, as line => enclosing
     * function. A null function means the code appears outside one.
     *
     * @return array<int, ?string>
     */
    private function raiseSites(string $code, WP_REST_Controller $controller): array
    {
        $sites = [];

        for ($class = new ReflectionClass($controller); $class !== false; $class = $class->getParentClass()) {
            $file = $class->getFileName();

            if (!is_string($file) || !is_readable($file)) {
                continue;
            }

            $functions = $this->functions($file);

            foreach (file($file) ?: [] as $index => $line) {
                if (!str_contains($line, sprintf("'%s'", $code))) {
                    continue;
                }

                $sites[$index + 1] = $this->enclosing($functions, $index + 1);
            }
        }

        return $sites;
    }

    /**
     * Named functions in a file, as declaration line => name.
     *
     * @return array<int, string>
     */
    private function functions(string $file): array
    {
        if (isset($this->memo[$file])) {
            return $this->memo[$file];
        }

        $tokens = token_get_all((string) file_get_contents($file));
        $found  = [];

        foreach ($tokens as $index => $token) {
            if (!is_array($token) || $token[0] !== T_FUNCTION) {
                continue;
            }

            for ($next = $index + 1; isset($tokens[$next]); $next++) {
                if (is_array($tokens[$next]) && $tokens[$next][0] === T_WHITESPACE) {
                    continue;
                }

                // Anything but a name is a closure or an arrow function, which
                // has no name to attribute a raise site to.
                if (is_array($tokens[$next]) && $tokens[$next][0] === T_STRING) {
                    $found[$token[2]] = $tokens[$next][1];
                }

                break;
            }
        }

        return $this->memo[$file] = $found;
    }

    /**
     * @param array<int, string> $functions
     */
    private function enclosing(array $functions, int $line): ?string
    {
        $name = null;

        foreach ($functions as $declared => $candidate) {
            if ($declared > $line) {
                break;
            }

            $name = $candidate;
        }

        return $name;
    }

    /**
     * Every code core's own REST controllers raise, for the coverage guard.
     *
     * @return array<int, string>
     */
    private function codesCoreRaises(): array
    {
        $codes = [];

        foreach (glob(ABSPATH . 'wp-includes/rest-api/endpoints/*.php') ?: [] as $file) {
            preg_match_all("/new WP_Error\(\s*'([a-z0-9_]+)'/", (string) file_get_contents($file), $matches);

            $codes = array_merge($codes, $matches[1]);
        }

        return array_values(array_unique($codes));
    }

    private function boot(): WP_REST_Server
    {
        global $wp_rest_server;

        $wp_rest_server = new WP_REST_Server();

        do_action('rest_api_init', $wp_rest_server);

        return $wp_rest_server;
    }

    /**
     * @param array<string, mixed> $body
     */
    private function dispatch(WP_REST_Server $server, string $route, array $body): \WP_REST_Response
    {
        $request = new WP_REST_Request('POST', $route);

        $request->set_header('content-type', 'application/json');
        $request->set_body((string) wp_json_encode($body));

        return $server->dispatch($request);
    }

    /**
     * @param array<string, mixed> $query
     */
    private function get(WP_REST_Server $server, string $route, array $query): \WP_REST_Response
    {
        $request = new WP_REST_Request('GET', $route);
        $request->set_query_params($query);

        return $server->dispatch($request);
    }

    /**
     * The arguments WordPress validates a route's GET against.
     *
     * @return array<string, array<string, mixed>>
     */
    private function readArgs(WP_REST_Server $server, string $route): array
    {
        foreach ($server->get_routes()[$route] as $endpoint) {
            if (!empty($endpoint['methods']['GET'])) {
                return $endpoint['args'];
            }
        }

        $this->fail(sprintf('"%s" has no GET endpoint.', $route));
    }
}
