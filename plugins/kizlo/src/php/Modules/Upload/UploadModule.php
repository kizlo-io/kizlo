<?php

namespace Kizlo\Modules\Upload;

use enshrined\svgSanitize\Sanitizer;
use Kizlo\Modules\Settings\Uploads\UploadsSettings;
use Kizlo\Support\Utils;

/**
 * Applies the Uploads settings to WordPress' media handling.
 *
 * Merges the enabled extra types into the `upload_mimes` allow list, corrects
 * WordPress' real-MIME detection for those types (which otherwise rejects SVG
 * and ICO), and sanitizes SVGs on upload to strip embedded scripts.
 */
class UploadModule
{
    public function register(): void
    {
        add_filter('upload_mimes', [$this, 'allowMimes']);
        add_filter('wp_check_filetype_and_ext', [$this, 'checkFiletypeAndExt'], 10, 4);
        add_filter('wp_handle_upload_prefilter', [$this, 'sanitizeSvgUpload']);
    }

    /**
     * Merge the enabled extra types into the allow list.
     *
     * @param  array<string, string> $mimes
     * @return array<string, string>
     */
    public function allowMimes(array $mimes): array
    {
        return array_merge($mimes, $this->uploads()->getUploadMimes());
    }

    /**
     * WordPress verifies the real MIME of a file against its extension and
     * blocks the upload when they disagree. SVG and ICO commonly trip this
     * (finfo reports `image/svg+xml`/`text/plain` or `image/vnd.microsoft.icon`),
     * so re-assert the extension for the types we explicitly allow.
     *
     * @param  array{ext: string|false, type: string|false, proper_filename?: string|false} $data
     * @param  array<string, string>|null $mimes
     * @return array{ext: string|false, type: string|false, proper_filename?: string|false}
     */
    public function checkFiletypeAndExt(array $data, string $file, string $filename, ?array $mimes): array
    {
        if (!empty($data['ext']) && !empty($data['type'])) {
            return $data;
        }

        $checked = wp_check_filetype($filename, $mimes);

        if ($checked['ext'] && $this->uploads()->isEnabled($checked['ext'])) {
            $data['ext']  = $checked['ext'];
            $data['type'] = $checked['type'];
        }

        return $data;
    }

    /**
     * @param array{
     *     name: string,
     *     type: string,
     *     tmp_name: string,
     *     error: int|string,
     *     size: int
     * } $file
     * @return array{
     *     name: string,
     *     type: string,
     *     tmp_name: string,
     *     error: int|string,
     *     size: int
     * }
     */
    public function sanitizeSvgUpload(array $file): array
    {
        $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

        if ($extension !== 'svg') {
            return $file;
        }

        if (!$this->uploads()->isEnabled('svg')) {
            $file['error'] = __('SVG uploads are not enabled.', 'kizlo');
            return $file;
        }

        $dirty = file_get_contents($file['tmp_name']);

        if ($dirty === false) {
            $file['error'] = __('The uploaded SVG could not be read.', 'kizlo');
            return $file;
        }

        $clean = (new Sanitizer())->sanitize($dirty);

        if ($clean === false) {
            $file['error'] = __('This SVG could not be sanitized and was rejected.', 'kizlo');
            return $file;
        }

        file_put_contents($file['tmp_name'], $clean);

        return $file;
    }

    private function uploads(): UploadsSettings
    {
        return Utils::getSettings()->uploads;
    }
}
