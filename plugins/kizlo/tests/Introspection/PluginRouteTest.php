<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\Introspection\PathNormalizer;
use Kizlo\Modules\Introspection\OperationErrors;
use Kizlo\Modules\Introspection\Spec;
use Kizlo\Modules\Settings\SettingsSchemas;

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

    /**
     * Supplying `custom_fields` replaces the whole collection, and the contract
     * has to say so where a caller writing one will read it.
     */
    public function test_custom_field_update_inputs_state_replacement_semantics(): void
    {
        foreach (['/settings/post_types/{slug}', '/settings/taxonomies/{slug}'] as $path) {
            $update = $this->operationAt($path, 'update');

            $this->assertNotSame([], $update, sprintf('%s should describe an update operation.', $path));

            $body         = (array) ($this->input($update)['body'] ?? []);
            $properties   = (array) ($body['properties'] ?? []);
            $customFields = (array) ($properties['custom_fields'] ?? []);

            $this->assertArrayHasKey('description', $customFields, sprintf('%s should say what supplying custom_fields does.', $path));

            $description = (string) $customFields['description'];
            $this->assertStringContainsString('replaces the complete ordered custom-field collection', $description);
            $this->assertStringContainsString('at every level', $description);
            $this->assertStringContainsString('are removed', $description);
            $this->assertStringContainsString('Omit `custom_fields` to leave the collection unchanged', $description);
        }
    }

    /**
     * The same wording must not reach a read. The update input and the read
     * responses share `kizlo.custom-field`, so a description placed on the
     * shared schema, or on the nested `fields` arrays inside it, would put
     * write-only advice on every response that returns a definition.
     */
    public function test_custom_field_read_schemas_carry_no_write_advice(): void
    {
        $schemas = $this->document()['schemas'];

        foreach ([SettingsSchemas::POST_TYPE, SettingsSchemas::TAXONOMY] as $id) {
            $properties   = (array) (($schemas[$id]['properties']) ?? []);
            $customFields = (array) ($properties['custom_fields'] ?? []);

            $this->assertArrayNotHasKey(
                'description',
                $customFields,
                sprintf('%s is a read schema and should carry no replacement advice.', $id)
            );
        }

        $nested = 0;
        foreach ((array) ($schemas[SettingsSchemas::CUSTOM_FIELD]['anyOf'] ?? []) as $member) {
            $properties = (array) ($member['properties'] ?? []);
            $fields     = (array) ($properties['fields'] ?? []);
            if ($fields === []) {
                continue;
            }

            $nested++;
            $this->assertSame('Child definitions, nested to any depth.', $fields['description'] ?? null);
        }

        // Group and repeater, so the loop above cannot pass by finding nothing.
        $this->assertSame(2, $nested);
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

    public function test_every_described_operation_carries_the_shared_runtime_errors(): void
    {
        foreach ($this->operations() as $name => $operation) {
            $missing = array_diff(OperationErrors::SHARED, $operation['errors']);

            $this->assertSame([], $missing, sprintf('%s omits shared runtime errors.', $name));
        }
    }

    public function test_every_described_operations_errors_are_sorted_and_unique(): void
    {
        foreach ($this->operations() as $name => $operation) {
            $errors = $operation['errors'];
            $sorted = $errors;
            sort($sorted, SORT_STRING);

            $this->assertSame($sorted, $errors, sprintf('%s has non-deterministic errors.', $name));
            $this->assertSame(array_values(array_unique($errors)), $errors, sprintf('%s repeats an error.', $name));
        }
    }

    public function test_handler_specific_errors_are_declared_on_existing_operations(): void
    {
        $operations = $this->operations();
        $expected   = [
            'kizlo.comments /comments (create)'                                    => 'not_logged_in',
            'kizlo.email /email/send (send)'                                       => 'kizlo_email_failed',
            'kizlo.post-types.post /post-types/post (create)'                      => 'rest_post_exists',
            'kizlo.taxonomies.category /taxonomies/category/{identifier} (update)' => 'rest_taxonomy_not_hierarchical',
            'kizlo.users /users/{field}/{value} (delete)'                          => 'cannot_delete_self',
        ];

        foreach ($expected as $operation => $code) {
            $this->assertArrayHasKey($operation, $operations);
            $this->assertContains($code, $operations[$operation]['errors'], sprintf('%s omits %s.', $operation, $code));
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
     * Every operation the plugin *serves*, keyed by something readable enough to
     * name in a failure.
     *
     * Scoped to `kizlo/v1` because that is what these assertions are about. The
     * document also carries the WordPress routes Kizlo only describes, and those
     * are a different contract: nothing wraps their callbacks, so they cannot
     * answer `invalid_param`, and the guard leaves them on WordPress's own
     * authentication, so they cannot answer `kizlo_rest_*` either. Requiring the
     * runtime error set of a route this plugin does not run would be requiring a
     * promise it has no way to keep.
     *
     * @return array<string, array<string, mixed>>
     */
    /**
     * One named operation at a normalized path, or an empty array when the
     * document has no such route.
     *
     * @return array<string, mixed>
     */
    private function operationAt(string $path, string $operation): array
    {
        foreach ($this->document()['apis'] as $api) {
            $declaration = $api['paths'][$path][$operation] ?? null;
            if (is_array($declaration)) {
                return $declaration;
            }
        }

        return [];
    }

    private function operations(): array
    {
        $operations = [];

        foreach ($this->document()['apis'] as $id => $api) {
            if ($api['namespace'] !== KIZLO_API_NAMESPACE) {
                continue;
            }

            foreach ($api['paths'] as $path => $named) {
                foreach ($named as $operation => $declaration) {
                    $operations[sprintf('%s %s (%s)', $id, $path, $operation)] = $declaration;
                }
            }
        }

        return $operations;
    }
}
