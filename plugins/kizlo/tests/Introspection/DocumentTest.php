<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\Introspection\Document;

/**
 * The emitted document: what it contains, how it is ordered, and that identical
 * configuration hashes identically.
 */
class DocumentTest extends IntrospectionTestCase
{
    public function test_a_plugin_with_nothing_registered_still_produces_a_valid_document(): void
    {
        $document = $this->document();

        $this->assertSame('1.0', $document['version']);
        $this->assertStringStartsWith('sha256:', $document['hash']);
        $this->assertSame(['version', 'hash', 'schemas', 'apis', 'diagnostics'], array_keys($document));
    }

    public function test_the_core_schemas_ship_with_the_document(): void
    {
        $schemas = $this->document()['schemas'];

        foreach (['kizlo.error', 'kizlo.media', 'kizlo.seo'] as $id) {
            $this->assertArrayHasKey($id, $schemas);
        }
    }

    public function test_schema_ids_api_ids_paths_operations_errors_and_responses_are_sorted(): void
    {
        kizlo_register_spec_schema('zeta.thing', ['type' => 'object', 'properties' => []]);
        kizlo_register_spec_schema('alpha.thing', ['type' => 'object', 'properties' => []]);

        kizlo_register_spec_route($this->operation(['id' => 'zeta.api', 'route' => '/zeta']));
        kizlo_register_spec_route($this->operation([
            'id'        => 'alpha.api',
            'route'     => '/beta',
            'operation' => 'retrieve',
            'method'    => 'POST',
            'errors'    => ['zeta_error', 'alpha_error'],
            'responses' => ['500' => ['body' => ['$ref' => 'kizlo.error']], '200' => ['body' => ['type' => 'string']]],
        ]));
        kizlo_register_spec_route($this->operation(['id' => 'alpha.api', 'route' => '/alpha']));

        $document = $this->document();

        $ids = array_keys($document['schemas']);
        $this->assertSame($ids, $this->sorted($ids));

        $apis = array_keys($document['apis']);
        $this->assertSame($apis, $this->sorted($apis));
        $this->assertSame(['/alpha', '/beta'], array_keys($document['apis']['alpha.api']['paths']));

        $operation = $document['apis']['alpha.api']['paths']['/beta']['retrieve'];
        $this->assertSame('POST', $operation['method']);
        $this->assertSame(['alpha_error', 'zeta_error'], $operation['errors']);
        // PHP coerces numeric array keys to integers; JSON encoding turns them back
        // into the string object keys the contract specifies.
        $this->assertSame(['200', '500'], array_map('strval', array_keys($operation['responses'])));
    }

    public function test_object_properties_keep_their_declared_order(): void
    {
        kizlo_register_spec_schema('acme.widget', [
            'type'       => 'object',
            'properties' => [
                'zeta'  => ['type' => 'string'],
                'alpha' => ['type' => 'string'],
                'mid'   => ['type' => 'string'],
            ],
        ]);

        $this->assertSame(
            ['zeta', 'alpha', 'mid'],
            array_keys($this->document()['schemas']['acme.widget']['properties']),
        );
    }

    public function test_identical_configuration_produces_an_identical_hash(): void
    {
        kizlo_register_spec_schema('acme.widget', ['type' => 'object', 'properties' => ['id' => ['type' => 'integer']]]);
        kizlo_register_spec_route($this->operation());

        $first = $this->document();

        $this->assertSame($first['hash'], $this->document()['hash']);
    }

    public function test_a_changed_contract_changes_the_hash(): void
    {
        kizlo_register_spec_schema('acme.widget', ['type' => 'object', 'properties' => ['id' => ['type' => 'integer']]]);
        $before = $this->document()['hash'];

        kizlo_register_spec_schema('acme.other', ['type' => 'object', 'properties' => []]);

        $this->assertNotSame($before, $this->document()['hash']);
    }

    public function test_changing_the_format_version_changes_the_hash(): void
    {
        $document = $this->document();
        $changed  = ['version' => '2.0'] + $document;

        $this->assertNotSame($document['hash'], Document::hash($changed));
    }

    public function test_the_hash_covers_the_document_without_itself(): void
    {
        $document = $this->document();

        $hashable = $document;
        unset($hashable['hash']);

        $this->assertSame(
            'sha256:' . hash('sha256', (string) wp_json_encode($hashable, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION)),
            $document['hash'],
        );
    }

    public function test_an_operation_is_emitted_without_the_registrys_bookkeeping(): void
    {
        kizlo_register_spec_route($this->operation([
            'summary'     => 'List widgets',
            'description' => 'Every widget.',
            'deprecated'  => true,
        ]));

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['list'];

        $this->assertSame(
            ['method', 'summary', 'description', 'deprecated', 'errors', 'input', 'responses'],
            array_keys($operation),
        );
        $this->assertSame('acme/v1', $this->document()['apis']['acme.widgets']['namespace']);
    }

    public function test_optional_operation_metadata_is_omitted_when_not_declared(): void
    {
        kizlo_register_spec_route($this->operation());

        $operation = $this->document()['apis']['acme.widgets']['paths']['/widgets']['list'];

        $this->assertSame(['method', 'errors', 'input', 'responses'], array_keys($operation));
        $this->assertSame([], $operation['errors']);
    }

    /**
     * @param array<int, string> $values
     * @return array<int, string>
     */
    private function sorted(array $values): array
    {
        sort($values, SORT_STRING);

        return $values;
    }
}
