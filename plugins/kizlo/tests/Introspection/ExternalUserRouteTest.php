<?php

namespace Kizlo\Tests\Introspection;

use Kizlo\Modules\User\UserSchemas;

class ExternalUserRouteTest extends IntrospectionTestCase
{
    public function test_external_user_operations_and_schema_are_exposed(): void
    {
        $document = $this->document();
        $path = $document['apis']['users.external']['paths']['/users/external/{provider}/{value}'];

        $this->assertSame(['create', 'delete', 'update'], array_keys($path));
        $this->assertSame('POST', $path['create']['method']);
        $this->assertSame('PUT', $path['update']['method']);
        $this->assertSame('DELETE', $path['delete']['method']);
        $this->assertSame(['provider', 'value'], array_keys($path['delete']['input']['properties']));
        $this->assertSame(['provider', 'value', 'email', 'first_name', 'last_name', 'profile'], array_keys($path['create']['input']['properties']));
        $this->assertContains('external_user_protected', $path['create']['errors']);
        $this->assertContains('external_user_not_found', $path['update']['errors']);
        $this->assertContains('external_user_delete_failed', $path['delete']['errors']);
        $this->assertContains('external_user_lock_unavailable', $path['delete']['errors']);
        $this->assertArrayHasKey(UserSchemas::EXTERNAL_USER_DELETION, $document['schemas']);
        $this->assertSame('boolean', $document['schemas'][UserSchemas::EXTERNAL_USER_DELETION]['properties']['deleted']['type']);
    }
}
