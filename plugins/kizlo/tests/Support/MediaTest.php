<?php

namespace Kizlo\Tests\Support;

use Kizlo\Tests\TestCase;

class MediaTest extends TestCase
{
    public function test_image_attachments_emit_the_image_member(): void
    {
        $id = $this->createAttachment('image/jpeg', 'cover.jpg', [
            'width'  => 1200,
            'height' => 630,
            'length' => 99,
        ]);
        update_post_meta($id, '_wp_attachment_image_alt', 'Cover');

        $media = \kizlo_ensure_media_data($id);

        $this->assertSame('image', $media['type']);
        $this->assertSame('Cover', $media['alt']);
        $this->assertSame(1200, $media['width']);
        $this->assertSame(630, $media['height']);
        $this->assertArrayNotHasKey('duration', $media);
        $this->assertSame($media, \kizlo_ensure_media_image_data($id));
    }

    public function test_video_attachments_emit_wordpress_dimensions_and_duration(): void
    {
        $id = $this->createAttachment('video/mp4', 'clip.mp4', [
            'width'  => 1920,
            'height' => 1080,
            'length' => 91,
        ]);

        $media = \kizlo_ensure_media_data($id);

        $this->assertSame('video', $media['type']);
        $this->assertSame(1920, $media['width']);
        $this->assertSame(1080, $media['height']);
        $this->assertSame(91, $media['duration']);
        $this->assertArrayNotHasKey('alt', $media);
        $this->assertArrayNotHasKey('variants', $media);
        $this->assertArrayNotHasKey('srcset', $media);
        $this->assertNull(\kizlo_ensure_media_image_data($id));
    }

    public function test_audio_attachments_emit_wordpress_duration_only(): void
    {
        $id = $this->createAttachment('audio/mpeg', 'episode.mp3', [
            'width'  => 640,
            'height' => 640,
            'length' => 245,
        ]);

        $media = \kizlo_ensure_media_data($id);

        $this->assertSame('audio', $media['type']);
        $this->assertSame(245, $media['duration']);
        $this->assertArrayNotHasKey('width', $media);
        $this->assertArrayNotHasKey('height', $media);
        $this->assertArrayNotHasKey('alt', $media);
    }

    public function test_other_attachments_emit_the_generic_file_member(): void
    {
        $id = $this->createAttachment('application/pdf', 'manual.pdf', [
            'width'  => 612,
            'height' => 792,
            'length' => 30,
        ]);

        $media = \kizlo_ensure_media_data($id);

        $this->assertSame('file', $media['type']);
        $this->assertSame('application/pdf', $media['mime']);
        foreach (['alt', 'width', 'height', 'duration', 'variants', 'srcset'] as $property) {
            $this->assertArrayNotHasKey($property, $media);
        }
    }

    /**
     * @param array<string, mixed> $metadata
     */
    private function createAttachment(string $mime, string $file, array $metadata): int
    {
        $id = self::factory()->post->create([
            'post_type'      => 'attachment',
            'post_mime_type' => $mime,
            'post_title'     => 'Attachment',
            'post_status'    => 'inherit',
        ]);

        update_post_meta($id, '_wp_attached_file', "2026/08/{$file}");
        wp_update_attachment_metadata($id, ['file' => "2026/08/{$file}"] + $metadata);

        return $id;
    }
}
