<?php

namespace Kizlo\Tests\Support;

use Kizlo\Support\Variables;
use Kizlo\Tests\TestCase;

/**
 * Phase 1 substrate proof: one behavioural assertion against real plugin code,
 * running inside a real WordPress under wp-phpunit. A pass proves the whole chain
 * — the plugin's dev dependencies, test DB provisioning, the container phpunit
 * runner, the plugin's autoloader loading inside WP, and per-test rollback.
 */
class VariablesTest extends TestCase
{
    public function test_resolves_context_variables_in_a_template(): void
    {
        $result = Variables::resolve('{{title}} by {{author}} on {{date}}', [
            'title'  => 'Hello World',
            'author' => 'Ada Lovelace',
            'date'   => '2026/07/06',
        ]);

        $this->assertSame('Hello World by Ada Lovelace on 2026/07/06', $result);
    }
}
