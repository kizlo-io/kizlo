<?php

namespace Kizlo\Tests\Settings;

use Kizlo\Modules\Settings\PublicSettings;
use Kizlo\Modules\Settings\Site\SiteSettings;
use Kizlo\Tests\TestCase;

final class PublicSettingsTest extends TestCase
{
    public function test_public_site_data_is_an_allowlist_that_cannot_include_server_configuration(): void
    {
        (new SiteSettings())->setData(['name' => 'Public name', 'secret' => 'private-signing-secret', 'backend_url' => 'https://private.example'])->save();
        $data = (new PublicSettings())->retrieve()->get_data();
        self::assertSame('Public name', $data['site']['name']);
        self::assertSame(['site', 'brand'], array_keys($data));
        self::assertArrayNotHasKey('secret', $data['site']);
        self::assertArrayNotHasKey('backend_url', $data['site']);
        self::assertStringNotContainsString('private-signing-secret', wp_json_encode($data));
    }
}
