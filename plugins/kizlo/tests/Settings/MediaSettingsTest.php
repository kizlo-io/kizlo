<?php

namespace Kizlo\Tests\Settings;

use InvalidArgumentException;
use Kizlo\Tests\TestCase;
use Kizlo\Modules\Settings\Brand\BrandSettings;
use Kizlo\Modules\Settings\Site\SiteSettings;

class MediaSettingsTest extends TestCase
{
    public function test_image_settings_accept_image_attachments(): void
    {
        $image = $this->attachment('image/svg+xml');

        $this->assertSame($image, (new SiteSettings())->setFallbackImage($image)->getFallbackImage());
        $this->assertSame($image, (new BrandSettings())->setLogo($image)->getLogo());
    }

    public function test_image_settings_reject_non_image_attachments(): void
    {
        $video = $this->attachment('video/mp4');

        $this->expectException(InvalidArgumentException::class);
        (new BrandSettings())->setLogo($video);
    }

    public function test_image_settings_reject_numeric_non_attachment_ids(): void
    {
        $post = self::factory()->post->create();

        $this->expectException(InvalidArgumentException::class);
        (new SiteSettings())->setFallbackImage($post);
    }

    private function attachment(string $mime): int
    {
        return self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => $mime,
            'post_status'    => 'inherit',
        ]);
    }
}
