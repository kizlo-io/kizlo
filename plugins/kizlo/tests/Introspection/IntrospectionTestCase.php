<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Tests\Seo\SeoTestCase;
use Kizlo\Modules\Introspection\Diagnostics;
use Kizlo\Modules\Introspection\ManagedContent;
use Kizlo\Modules\Introspection\Registry;
use Kizlo\Modules\Introspection\SpecStore;

/**
 * Base case for the introspection suite.
 *
 * Two things are process-global and have to be cleared per test: the spec store
 * (contributions registered by a previous test would otherwise leak into the next
 * one's document) and the managed-content memo (built from settings a previous
 * test may have seeded).
 *
 * Every test registers through the public functions, which puts them on the
 * third-party side of the reserved-prefix boundary — the same side a real plugin
 * is on.
 */
abstract class IntrospectionTestCase extends SeoTestCase
{
    private ?\WP_Hook $restApiInit = null;

    protected function setUp(): void
    {
        parent::setUp();

        SpecStore::reset();
        ManagedContent::flush();

        $hook              = $GLOBALS['wp_filter']['rest_api_init'] ?? null;
        $this->restApiInit = $hook instanceof \WP_Hook ? clone $hook : null;
    }

    protected function tearDown(): void
    {
        // kizlo_register_route() defers the actual registration to rest_api_init,
        // so a route registered by one test would keep firing in every later one —
        // and once its schemas are gone with the store, it starts reporting a
        // registration failure against tests that never asked for it.
        if ($this->restApiInit === null) {
            unset($GLOBALS['wp_filter']['rest_api_init']);
        } else {
            $GLOBALS['wp_filter']['rest_api_init'] = $this->restApiInit;
        }

        SpecStore::reset();
        ManagedContent::flush();

        parent::tearDown();
    }

    /**
     * The built document. Always succeeds now; what could not be published shows
     * up in `diagnostics` instead of failing the request.
     *
     * @return array<string, mixed>
     */
    protected function document(): array
    {
        ManagedContent::flush();

        return Registry::build();
    }

    /**
     * Entries that cost a type, so whatever declared them was excluded.
     *
     * @return array<int, array<string, string>>
     */
    protected function errors(): array
    {
        return $this->diagnostics(Diagnostics::ERROR);
    }

    /**
     * Entries that were ignored. The contract is still complete without them.
     *
     * @return array<int, array<string, string>>
     */
    protected function warnings(): array
    {
        return $this->diagnostics(Diagnostics::WARNING);
    }

    /**
     * @return array<int, array<string, string>>
     */
    protected function diagnostics(?string $type = null): array
    {
        $entries = $this->document()['diagnostics'];

        if ($type === null) {
            return $entries;
        }

        return array_values(array_filter($entries, static fn(array $e): bool => $e['type'] === $type));
    }

    /**
     * @param array<int, array<string, string>> $errors
     */
    protected function assertErrorContains(array $errors, string $needle, string $message = ''): void
    {
        foreach ($errors as $error) {
            if (str_contains($error['message'], $needle)) {
                $this->assertTrue(true);
                return;
            }
        }

        $this->fail($message ?: sprintf('No error mentioned "%s". Got: %s', $needle, $this->describe($errors)));
    }

    /**
     * @param array<int, array<string, string>> $errors
     */
    protected function assertNoErrorContains(array $errors, string $needle): void
    {
        foreach ($errors as $error) {
            $this->assertStringNotContainsString($needle, $error['message']);
        }
    }

    /**
     * Errors located against one schema or API, so a test can assert on its own
     * contributions without the rest of the document's noise.
     *
     * @param array<int, array<string, string>> $errors
     * @return array<int, array<string, string>>
     */
    protected function errorsFor(array $errors, string $key, string $value): array
    {
        return array_values(array_filter(
            $errors,
            static fn(array $error): bool => (Diagnostics::dataOf($error)[$key] ?? null) === $value,
        ));
    }

    /**
     * @param array<int, array<string, string>> $errors
     */
    protected function describe(array $errors): string
    {
        return wp_json_encode($errors, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) ?: '[]';
    }

    /**
     * A minimal valid operation, so a test only states the part it is exercising.
     *
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    protected function operation(array $overrides = []): array
    {
        return array_merge([
            'id'        => 'acme.widgets',
            'operation' => 'list',
            'namespace' => 'acme/v1',
            'route'     => '/widgets',
            'methods'   => ['GET'],
            'input'     => ['type' => 'object', 'properties' => []],
            'responses' => ['200' => ['body' => ['type' => 'array', 'items' => ['type' => 'string']]]],
        ], $overrides);
    }
}
