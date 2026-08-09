<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\Introspection\RouteRegistrar;

/**
 * `kizlo.*`, `post-types.*` and `taxonomies.*` are generated and owned by core.
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
            'kizlo prefix'      => ['kizlo.thing'],
            'post-types prefix' => ['post-types.thing'],
            'taxonomies prefix' => ['taxonomies.thing'],
        ];
    }

    /**
     * @dataProvider reservedIds
     */
    public function test_a_reserved_schema_id_is_rejected_from_outside_the_plugin(string $id): void
    {
        $this->setExpectedIncorrectUsage('kizlo_register_spec_schema');

        kizlo_register_spec_schema($id, ['type' => 'object', 'properties' => []]);

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
            $routes[] = $this->operation(['id' => 'post-types.book', 'namespace' => 'kizlo/v1']);

            return $routes;
        });

        $this->assertErrorContains($this->errors(), 'The "post-types." prefix is reserved for Kizlo core');
    }

    public function test_core_may_register_into_a_reserved_prefix(): void
    {
        RouteRegistrar::registerSchema('kizlo.extra', ['type' => 'object', 'properties' => []], true);

        $this->assertArrayHasKey('kizlo.extra', $this->document()['schemas']);
    }

    public function test_a_vendor_qualified_id_is_accepted_from_outside_the_plugin(): void
    {
        kizlo_register_spec_schema('acme.thing', ['type' => 'object', 'properties' => []]);

        $this->assertArrayHasKey('acme.thing', $this->document()['schemas']);
    }

    public function test_the_test_suite_itself_counts_as_third_party(): void
    {
        $this->assertFalse(
            \Kizlo\Modules\Introspection\SpecStore::isCoreFile(__FILE__),
            'Only the plugin\'s own source tree is core, which is what keeps this rule testable.',
        );
    }
}
