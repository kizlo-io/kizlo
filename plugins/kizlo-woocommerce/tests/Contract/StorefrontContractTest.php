<?php

namespace Kizlo\WooCommerce\Tests\Contract;

use Kizlo\Modules\Introspection\Registry;
use Kizlo\WooCommerce\Modules\Storefront\StorefrontModule;
use Kizlo\WooCommerce\Modules\Storefront\StorefrontSchema;
use Kizlo\WooCommerce\Tests\TestCase;

class StorefrontContractTest extends TestCase
{
    public function test_runtime_classification_matches_the_published_string_list_schema(): void
    {
        $module = new StorefrontModule();
        $module->register();
        $this->bootRestServer();
        $schema = Registry::build()['schemas'][StorefrontSchema::ID]['properties']['checkout']['properties']['local_pickup'];
        $this->assertSame('array', $schema['properties']['method_ids']['type']);
        $this->assertSame('string', $schema['properties']['method_ids']['items']['type']);
        $this->assertTrue($schema['properties']['method_ids']['required']);
        $payload = $module->retrieve()->get_data()['checkout']['local_pickup'];
        $this->assertTrue(rest_validate_value_from_schema($payload, $schema));
        unset($payload['method_ids']);
        $this->assertWPError(rest_validate_value_from_schema($payload, $schema));
    }
}
