<?php

namespace Kizlo\WooCommerce\Tests\Contract;

use Kizlo\Modules\Introspection\Registry;
use Kizlo\Modules\Introspection\ArgTranslator;
use Kizlo\WooCommerce\Modules\Customer\CustomerModule;
use Kizlo\WooCommerce\Modules\Contract\ContractModule;
use Kizlo\WooCommerce\Tests\TestCase;

class CustomerContractTest extends TestCase
{
    /**
     * Materialized schemas must not leak into tests with different field registrations.
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function test_customer_api_reuses_the_native_schema_and_describes_provisioning_errors(): void
    {
        (new ContractModule())->describe();
        (new CustomerModule())->register();
        $this->bootRestServer();
        $document = Registry::build();
        $api = $document['apis']['woocommerce.kizlo.customers'];
        $operation = $api['paths']['/woocommerce/customers']['retrieve'];

        $this->assertSame('kizlo/v1', $api['namespace']);
        $this->assertSame('GET', $operation['method']);
        $this->assertSame(['$ref' => 'woocommerce.customers'], $operation['responses']['200']['body']);
        $this->assertSame([], (array) $operation['input']);
        foreach (['kizlo_invalid_identity', 'kizlo_forbidden_identity', 'kizlo_customer_unavailable', 'kizlo_rest_unauthorized', 'kizlo_rest_forbidden'] as $code) {
            $this->assertContains($code, $operation['errors']);
        }
        foreach (['401', '403', '503'] as $status) {
            $this->assertSame(['$ref' => 'kizlo.error'], $operation['responses'][$status]['body']);
        }

        $properties = $document['schemas']['woocommerce.customers']['properties'];
        $this->assertArrayHasKey('id', $properties);
        $this->assertArrayHasKey('email', $properties);
        $this->assertArrayHasKey('additional_fields', $properties);
        $this->assertArrayHasKey('additional_fields', $properties['billing']['properties']);
        $this->assertArrayHasKey('additional_fields', $properties['shipping']['properties']);
        $this->assertTrue($properties['date_modified']['nullable']);
        $this->assertTrue($properties['date_modified_gmt']['nullable']);

        $request = new \WP_REST_Request('GET');
        $request->set_header('X-Kizlo-User-Email', 'contract-customer@example.com');
        $id = self::factory()->user->create(['role' => 'customer', 'user_email' => 'contract-customer@example.com']);
        update_user_meta($id, 'billing_email', 'contract-customer@example.com');
        wp_set_current_user(self::factory()->user->create(['role' => 'administrator']));
        $payload = (new CustomerModule())->retrieve($request)->get_data();
        $schema = ArgTranslator::toArgs([
            'type' => 'object',
            'properties' => ['customer' => $operation['responses']['200']['body']],
        ], $document['schemas'])['customer'];
        $this->assertTrue(rest_validate_value_from_schema($payload, $schema));
    }
}
