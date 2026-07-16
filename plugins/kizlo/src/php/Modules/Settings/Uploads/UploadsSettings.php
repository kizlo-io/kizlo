<?php

namespace Kizlo\Modules\Settings\Uploads;

use Kizlo\Modules\Settings\SettingsAbstract;

/**
 * Controls which extra file types WordPress accepts on upload.
 *
 * WordPress blocks a handful of useful types (SVG, favicons) by default. Each
 * key enabled here is merged into the `upload_mimes` allow list; SVGs are
 * additionally sanitized on upload by UploadModule.
 */
class UploadsSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_uploads';

    /**
     * The file types this setting can enable, keyed by extension.
     *
     * @var array<string, array{label: string, mime: string}>
     */
    public const SUPPORTED_MIMES = [
        'svg'  => ['label' => 'SVG',            'mime' => 'image/svg+xml'],
        'ico'  => ['label' => 'ICO (favicon)',  'mime' => 'image/x-icon'],
        'webp' => ['label' => 'WebP',           'mime' => 'image/webp'],
        'avif' => ['label' => 'AVIF',           'mime' => 'image/avif'],
    ];

    protected array $data = [
        'allowed_mimes' => ['svg', 'ico'],
    ];

    /**
     * Extensions the user has enabled for upload.
     *
     * @return array<int, string>
     */
    public function getAllowedMimes(): array
    {
        return $this->get('allowed_mimes') ?? [];
    }

    /**
     * @param array<int, string> $value
     */
    public function setAllowedMimes(array $value): static
    {
        $this->set('allowed_mimes', $value);
        return $this;
    }

    /**
     * Whether a given extension is enabled for upload.
     */
    public function isEnabled(string $extension): bool
    {
        return in_array($extension, $this->getAllowedMimes(), true);
    }

    /**
     * Enabled extensions resolved to the `upload_mimes` shape (ext => mime type).
     *
     * @return array<string, string>
     */
    public function getUploadMimes(): array
    {
        $mimes = [];

        foreach ($this->getAllowedMimes() as $extension) {
            if (isset(self::SUPPORTED_MIMES[$extension])) {
                $mimes[$extension] = self::SUPPORTED_MIMES[$extension]['mime'];
            }
        }

        return $mimes;
    }

    /**
     * The supported types as UI options for the settings bootstrap payload.
     *
     * @return array<int, array{value: string, label: string, mime: string}>
     */
    public static function supportedMimeOptions(): array
    {
        $options = [];

        foreach (self::SUPPORTED_MIMES as $extension => $meta) {
            $options[] = [
                'value' => $extension,
                'label' => $meta['label'],
                'mime'  => $meta['mime'],
            ];
        }

        return $options;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'allowed_mimes' => $this->sanitizeAllowedMimes($value),
            default         => $value,
        };
    }

    /**
     * Keep only known, supported extension keys.
     *
     * @return array<int, string>
     */
    private function sanitizeAllowedMimes(mixed $value): array
    {
        if (!is_array($value)) return [];

        $supported = array_keys(self::SUPPORTED_MIMES);
        $requested = array_map('sanitize_key', $value);

        return array_values(array_intersect($supported, $requested));
    }
}
