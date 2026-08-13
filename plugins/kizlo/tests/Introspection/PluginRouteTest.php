<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\Introspection\PathNormalizer;
use Kizlo\Modules\Introspection\Spec;

/**
 * Every route this plugin serves is in the contract, and says something.
 *
 * The rest of this suite registers its own routes and asserts on those. This
 * one asserts on the real ones: it reads the routes WordPress has under the
 * Kizlo namespace and looks each one up in the built document. A route added
 * later without a contract fails here rather than quietly going missing from
 * whatever the document generates.
 */
class PluginRouteTest extends IntrospectionTestCase
{
    /**
     * Registered by hand, described on purpose in its own docblock: a generator
     * has to fetch this one before it can read anything, so a contract for it
     * would be read by nobody.
     */
    private const NOT_DESCRIBED = ['/introspect'];

    public function test_every_kizlo_route_is_described(): void
    {
        $paths = $this->paths();

        // Named so the test cannot pass by finding nothing: an empty route list
        // would make every assertion below vacuous.
        $this->assertContains('/settings', $paths);
        $this->assertContains('/settings/post_types/{slug}', $paths);

        $missing = [];

        foreach ($paths as $path) {
            if (!$this->described($path)) {
                $missing[] = $path;
            }
        }

        $this->assertSame([], $missing, 'These routes are registered but contribute nothing to /introspect.');
    }

    public function test_every_described_operation_declares_a_success_response(): void
    {
        foreach ($this->operations() as $name => $operation) {
            $statuses = array_map('strval', array_keys($operation['responses']));
            $success  = array_filter($statuses, static fn(string $status): bool => str_starts_with($status, '2'));

            $this->assertNotSame([], $success, sprintf('%s declares no 2xx response.', $name));
        }
    }

    public function test_every_described_operation_declares_one_http_method(): void
    {
        foreach ($this->operations() as $name => $operation) {
            $this->assertIsString($operation['method'], sprintf('%s must declare one HTTP method.', $name));
            $this->assertContains($operation['method'], Spec::METHODS);
        }
    }

    public function test_every_described_operation_names_a_body_for_its_success(): void
    {
        foreach ($this->operations() as $name => $operation) {
            foreach ($operation['responses'] as $status => $response) {
                if (!str_starts_with((string) $status, '2')) {
                    continue;
                }

                $this->assertArrayHasKey('body', $response, sprintf('%s answers %s with an undescribed body.', $name, $status));
            }
        }
    }

    /**
     * The document is built from the registrations, and the registrations are
     * what WordPress serves, so a contract that reports errors is describing
     * routes that are running.
     */
    public function test_the_plugins_own_contract_is_error_free(): void
    {
        $mine = array_values(array_filter(
            $this->errors(),
            static fn(array $error): bool => !str_contains($error['message'], 'acme'),
        ));

        $this->assertSame([], $mine, 'The plugin\'s own contract reported errors.');
    }

    // ============================================================
    // INTERNALS
    // ============================================================

    /**
     * The routes WordPress is serving under `kizlo/v1`, as contract paths.
     *
     * @return array<int, string>
     */
    private function paths(): array
    {
        $prefix = '/' . KIZLO_API_NAMESPACE;
        $paths  = [];

        foreach (array_keys(rest_get_server()->get_routes()) as $route) {
            if ($route === $prefix || !str_starts_with($route, $prefix . '/')) {
                continue;
            }

            $path = substr($route, strlen($prefix));

            if (in_array($path, self::NOT_DESCRIBED, true)) {
                continue;
            }

            $paths[] = PathNormalizer::normalize($path)['path'];
        }

        return array_values(array_unique($paths));
    }

    private function described(string $path): bool
    {
        foreach ($this->document()['apis'] as $api) {
            if (isset($api['paths'][$path])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Every operation the plugin describes, keyed by something readable enough
     * to name in a failure.
     *
     * @return array<string, array<string, mixed>>
     */
    private function operations(): array
    {
        $operations = [];

        foreach ($this->document()['apis'] as $id => $api) {
            foreach ($api['paths'] as $path => $named) {
                foreach ($named as $operation => $declaration) {
                    $operations[sprintf('%s %s (%s)', $id, $path, $operation)] = $declaration;
                }
            }
        }

        return $operations;
    }
}
