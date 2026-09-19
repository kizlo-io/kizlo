<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\Introspection\RouteRegistrar;

/**
 * `kizlo.*` is generated and owned by core, and every route the plugin registers
 * lives under it.
 *
 * Schema IDs are global and third-party plugins contribute through the same
 * hooks, so the rule is enforced rather than documented: a contribution from
 * outside the plugin's own source tree cannot claim one of these, whether it goes
 * through the helper or straight through the filter.
 */
class ReservedPrefixTest extends IntrospectionTestCase
{
    /**
     * @return array<int, string>
     */
    public static function reservedIds(): array
    {
        return [
            'kizlo prefix'        => ['kizlo.thing'],
            'kizlo nested prefix' => ['kizlo.post-types.thing'],
        ];
    }

    /**
     * @dataProvider reservedIds
     */
    public function test_a_reserved_schema_id_is_rejected_from_outside_the_plugin(string $id): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_route_schema');

        $this->registerRouteSchema($id, ['type' => 'object', 'properties' => []]);

        $this->assertErrorContains($this->errors(), 'reserved for Kizlo core');
    }

    public function test_a_reserved_schema_id_is_rejected_when_pushed_straight_through_the_filter(): void
    {
        add_filter('kizlo_introspection_schemas', static function (array $schemas): array {
            $schemas[] = ['id' => 'kizlo.error', 'schema' => ['type' => 'string']];

            return $schemas;
        });

        $this->assertErrorContains($this->errors(), 'The "kizlo." prefix is reserved for Kizlo core');
    }

    public function test_a_reserved_api_id_is_rejected_when_pushed_straight_through_the_filter(): void
    {
        add_filter('kizlo_introspection_routes', function (array $routes): array {
            $routes[] = $this->operation(['id' => 'kizlo.books', 'namespace' => 'kizlo/v1']);

            return $routes;
        });

        $this->assertErrorContains($this->errors(), 'The "kizlo." prefix is reserved for Kizlo core');
    }

    /**
     * The bare id is the one that reaches furthest: `kizlo` plus the operation
     * `email` claims the same generated member as core's own `kizlo.email` API.
     */
    public function test_the_bare_reserved_api_id_is_rejected_when_pushed_straight_through_the_filter(): void
    {
        add_filter('kizlo_introspection_routes', function (array $routes): array {
            $routes[] = $this->operation(['id' => 'kizlo', 'operation' => 'email', 'namespace' => 'kizlo/v1']);

            return $routes;
        });

        $this->assertErrorContains($this->errors(), 'The "kizlo." prefix is reserved for Kizlo core');
    }

    public function test_core_may_register_into_a_reserved_prefix(): void
    {
        RouteRegistrar::registerSchema('kizlo.extra', ['type' => 'object', 'properties' => []], true);

        $this->assertArrayHasKey('kizlo.extra', $this->document()['schemas']);
    }

    public function test_a_vendor_qualified_id_is_accepted_from_outside_the_plugin(): void
    {
        $this->registerRouteSchema('acme.thing', ['type' => 'object', 'properties' => []]);

        $this->assertArrayHasKey('acme.thing', $this->document()['schemas']);
    }

    /**
     * Core's own content routes moved under `kizlo.`, which hands these two names
     * back to anyone who wants them, WordPress included.
     *
     * @return array<string, array<int, string>>
     */
    public static function freedIds(): array
    {
        return [
            'post-types' => ['post-types.thing'],
            'taxonomies' => ['taxonomies.thing'],
        ];
    }

    /**
     * @dataProvider freedIds
     */
    public function test_a_formerly_reserved_id_is_accepted_from_outside_the_plugin(string $id): void
    {
        $this->registerRouteSchema($id, ['type' => 'object', 'properties' => []]);

        $this->assertArrayHasKey($id, $this->document()['schemas']);
    }

    public function test_the_test_suite_itself_counts_as_third_party(): void
    {
        $this->assertFalse(
            \Kizlo\Modules\Introspection\SpecStore::isCoreFile(__FILE__),
            'Only the plugin\'s own source tree is core, which is what keeps this rule testable.',
        );
    }
}
