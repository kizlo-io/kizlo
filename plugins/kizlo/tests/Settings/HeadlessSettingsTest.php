<?php

namespace Kizlo\Tests\Settings;

use Kizlo\Tests\TestCase;
use Kizlo\Modules\Settings\Headless\HeadlessSettings;
use Kizlo\Modules\Settings\Headless\HeadlessSettingsService;

/**
 * HeadlessSettings: the master switch gates every child, all fields sanitize to
 * bool, and the defaults keep preview/view-links/block-indexing on while the
 * aggressive surfaces stay off.
 */
class HeadlessSettingsTest extends TestCase
{
    public function test_defaults_keep_the_master_off_and_safe_children_on(): void
    {
        $settings = new HeadlessSettings([]);
        $data = $settings->getData();

        $this->assertFalse($data['enabled']);
        $this->assertTrue($data['preview']);
        $this->assertTrue($data['view_links']);
        $this->assertTrue($data['block_indexing']);
        $this->assertNull($data['login_slug']);

        foreach (['frontend_lockout', 'frontend_lockout_redirect', 'disable_feeds', 'disable_embeds', 'disable_xmlrpc', 'block_enumeration', 'clean_head', 'disable_file_editor', 'disable_pingbacks', 'rename_login'] as $aggressive) {
            $this->assertFalse($data[$aggressive], "{$aggressive} should default off");
        }
    }

    public function test_every_field_sanitizes_to_bool(): void
    {
        $settings = new HeadlessSettings([]);
        $settings->setData(['enabled' => '1', 'preview' => 0, 'frontend_lockout' => 'yes']);

        $data = $settings->getData();

        $this->assertTrue($data['enabled']);
        $this->assertFalse($data['preview']);
        $this->assertTrue($data['frontend_lockout']);
    }

    public function test_children_are_inert_while_the_master_is_off(): void
    {
        $settings = new HeadlessSettings([]);
        $settings->setData(['enabled' => false, 'preview' => true, 'block_indexing' => true]);

        $this->assertFalse($settings->isMasterEnabled());
        $this->assertFalse($settings->isEnabled('preview'));
        $this->assertFalse($settings->isEnabled('block_indexing'));
    }

    public function test_a_child_is_enabled_only_when_master_and_child_are_both_on(): void
    {
        $settings = new HeadlessSettings([]);
        $settings->setData(['enabled' => true, 'preview' => true, 'frontend_lockout' => false]);

        $this->assertTrue($settings->isMasterEnabled());
        $this->assertTrue($settings->isEnabled('preview'));
        $this->assertFalse($settings->isEnabled('frontend_lockout'));
    }

    public function test_service_response_carries_the_toggle_map(): void
    {
        $settings = new HeadlessSettings([]);
        $settings->setData(['enabled' => true]);

        $response = (new HeadlessSettingsService())->toResponse($settings);

        $this->assertTrue($response['enabled']);
        $this->assertArrayHasKey('disable_pingbacks', $response);
        $this->assertArrayHasKey('login_slug', $response);
    }

    public function test_login_slug_is_normalised(): void
    {
        $settings = new HeadlessSettings([]);
        $settings->setData(['login_slug' => 'My Secret Login']);

        $this->assertSame('my-secret-login', $settings->getLoginSlug());
    }

    public function test_reserved_and_empty_login_slugs_are_refused(): void
    {
        foreach (['wp-admin', 'admin', 'login', 'wp-login.php', '   '] as $reserved) {
            $settings = new HeadlessSettings([]);
            $settings->setData(['login_slug' => $reserved]);

            $this->assertNull($settings->getLoginSlug(), "'{$reserved}' should be refused");
        }
    }

    public function test_login_rename_needs_the_master_toggle_and_a_slug(): void
    {
        $no_slug = new HeadlessSettings([]);
        $no_slug->setData(['enabled' => true, 'rename_login' => true]);
        $this->assertFalse($no_slug->isLoginRenameActive(), 'No slug means not active.');

        $master_off = new HeadlessSettings([]);
        $master_off->setData(['enabled' => false, 'rename_login' => true, 'login_slug' => 'secret']);
        $this->assertFalse($master_off->isLoginRenameActive(), 'Master off means not active.');

        $active = new HeadlessSettings([]);
        $active->setData(['enabled' => true, 'rename_login' => true, 'login_slug' => 'secret']);
        $this->assertTrue($active->isLoginRenameActive());
    }
}
