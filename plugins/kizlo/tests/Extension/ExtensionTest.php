<?php

namespace Kizlo\Tests\Extension;

use Kizlo\Modules\Extension\Extensions;
use Kizlo\Modules\Extension\Plugins;
use Kizlo\Tests\TestCase;

/**
 * `kizlo_extension()`, the gate an extension plugin starts through.
 *
 * The fixtures are plugin headers and nothing else. `Extensions::register()` reads
 * the file rather than running it, which is the property the whole design rests
 * on: an extension that cannot be supported never executes a line, so it cannot
 * reach a function core does not have.
 *
 * `kizlo` itself stands in as the plugin every fixture requires, since the suite
 * runs with the real plugin bind-mounted and active. Requirements are written far
 * either side of its version (`0.0.1`, `999.0.0`) so a release does not move them.
 */
class ExtensionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Extensions::reset();
        Plugins::reset();

        update_option('active_plugins', ['kizlo/kizlo.php']);
    }

    private function fixture(string $name): string
    {
        return __DIR__ . '/fixtures/' . $name . '.php';
    }

    /**
     * @param array<int, mixed> $calls
     */
    private function register(string $name, array &$calls): bool
    {
        return kizlo_extension($this->fixture($name), static function () use (&$calls): void {
            $calls[] = true;
        });
    }

    // ============================================================
    // BOOTING
    // ============================================================

    public function test_an_extension_whose_requirements_hold_boots(): void
    {
        $calls = [];

        $this->assertTrue($this->register('met', $calls));
        $this->assertCount(1, $calls);
        $this->assertSame([], Extensions::blocked());
    }

    public function test_an_extension_declaring_nothing_boots(): void
    {
        $calls = [];

        $this->assertTrue($this->register('undeclared', $calls));
        $this->assertCount(1, $calls);
    }

    public function test_a_booted_extension_is_recorded_with_its_version(): void
    {
        $calls = [];
        $this->register('met', $calls);

        $this->assertSame(['1.4.0'], array_values(Extensions::booted()));
    }

    // ============================================================
    // BLOCKING
    // ============================================================

    public function test_an_extension_requiring_a_newer_kizlo_does_not_boot(): void
    {
        $calls = [];

        $this->assertFalse($this->register('outdated', $calls));
        $this->assertSame([], $calls);
        $this->assertSame([], Extensions::booted());
    }

    public function test_an_extension_requiring_an_inactive_plugin_does_not_boot(): void
    {
        $calls = [];

        $this->assertFalse($this->register('inactive', $calls));
        $this->assertSame([], $calls);
    }

    /**
     * A requirement that cannot be read is the same mistake as the missing
     * requirement it was meant to be, so it blocks rather than being skipped.
     */
    public function test_an_unreadable_requirement_does_not_boot(): void
    {
        $calls = [];

        $this->assertFalse($this->register('malformed', $calls));
        $this->assertSame([], $calls);
    }

    // ============================================================
    // REPORTING
    // ============================================================

    public function test_a_blocked_extension_reports_only_the_requirement_that_failed(): void
    {
        $calls = [];
        $this->register('inactive', $calls);

        $blocked = Extensions::blocked();

        $this->assertCount(1, $blocked);
        $this->assertSame('Fixture Inactive', $blocked[0]['name']);
        $this->assertCount(1, $blocked[0]['unmet']);
        $this->assertSame('nothing-is-installed-here', $blocked[0]['unmet'][0]->slug);
    }

    public function test_an_outdated_requirement_names_the_version_it_needs(): void
    {
        $calls = [];
        $this->register('outdated', $calls);

        $described = Extensions::blocked()[0]['unmet'][0]->describe();

        $this->assertStringContainsString('999.0.0', $described);
        $this->assertStringContainsString(KIZLO_VERSION, $described);
    }

    public function test_an_inactive_requirement_says_so(): void
    {
        $calls = [];
        $this->register('inactive', $calls);

        $this->assertStringContainsString('is not active', Extensions::blocked()[0]['unmet'][0]->describe());
    }

    public function test_an_unreadable_requirement_quotes_what_was_written(): void
    {
        $calls = [];
        $this->register('malformed', $calls);

        $this->assertStringContainsString('kizlo0.12.0', Extensions::blocked()[0]['unmet'][0]->describe());
    }
}
