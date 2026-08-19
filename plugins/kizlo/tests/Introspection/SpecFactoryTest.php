<?php

namespace Kizlo\Tests\Introspection;

use TypeError;
use WP_REST_Server;

/** The lazy boundary around document-only route and schema derivation. */
class SpecFactoryTest extends IntrospectionTestCase
{
    public function test_factories_run_once_when_the_document_first_needs_them(): void
    {
        $schemaRuns = 0;
        $routeRuns  = 0;

        kizlo_register_route_schema('acme.lazy', static function () use (&$schemaRuns): array {
            $schemaRuns++;

            return ['type' => 'object', 'properties' => ['id' => ['type' => 'integer']]];
        });

        kizlo_register_route_spec(function () use (&$routeRuns): array {
            $routeRuns++;

            return $this->operation([
                'responses' => ['200' => ['body' => ['$ref' => 'acme.lazy']]],
            ]);
        });

        $this->assertSame(0, $schemaRuns);
        $this->assertSame(0, $routeRuns);

        $first  = $this->document();
        $second = $this->document();

        $this->assertSame(1, $schemaRuns);
        $this->assertSame(1, $routeRuns);
        $this->assertSame($first['hash'], $second['hash']);
        $this->assertArrayHasKey('acme.lazy', $first['schemas']);
        $this->assertArrayHasKey('acme.widgets', $first['apis']);
    }

    public function test_runtime_registration_materializes_only_the_schema_graph_its_input_references(): void
    {
        $usedRuns   = 0;
        $nestedRuns = 0;
        $unusedRuns = 0;

        kizlo_register_route_schema('acme.address', static function () use (&$usedRuns): array {
            $usedRuns++;

            return [
                'type'       => 'object',
                'properties' => ['country' => ['$ref' => 'acme.country']],
            ];
        });
        kizlo_register_route_schema('acme.country', static function () use (&$nestedRuns): array {
            $nestedRuns++;

            return ['type' => 'string'];
        });
        kizlo_register_route_schema('acme.unused', static function () use (&$unusedRuns): array {
            $unusedRuns++;

            return ['type' => 'string'];
        });

        kizlo_register_route([
            'id'        => 'acme.factory-runtime',
            'operation' => 'create',
            'method'    => 'POST',
            'route'     => '/factory-runtime',
            'input'     => [
                'type'       => 'object',
                'properties' => ['address' => ['$ref' => 'acme.address']],
            ],
            'responses' => ['200' => ['body' => ['type' => 'boolean']]],
            'callback'  => static fn(): bool => true,
        ]);

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        do_action('rest_api_init', $wp_rest_server);

        $this->assertSame(1, $usedRuns);
        $this->assertSame(1, $nestedRuns);
        $this->assertSame(0, $unusedRuns);
        $this->assertArrayHasKey('/kizlo/v1/factory-runtime', $wp_rest_server->get_routes());

        $this->document();

        $this->assertSame(1, $usedRuns);
        $this->assertSame(1, $nestedRuns);
        $this->assertSame(1, $unusedRuns);
    }

    public function test_an_array_cannot_bypass_lazy_route_derivation(): void
    {
        $this->expectException(TypeError::class);

        kizlo_register_route_spec([]);
    }

    public function test_an_array_cannot_bypass_lazy_schema_derivation(): void
    {
        $this->expectException(TypeError::class);

        kizlo_register_route_schema('acme.eager', []);
    }
}
