<?php

namespace Kizlo\Modules\Settings\Uploads;

use Kizlo\Modules\Settings\SettingsAbstract;

/**
 * Controls which extra file types WordPress accepts on upload.
 *
 * WordPress blocks a handful of useful types by default. Admins add the ones
 * they need here as `{ext, mime}` pairs; each is merged into the `upload_mimes`
 * allow list and SVGs are additionally sanitized on upload by UploadModule.
 *
 * Because an enabled type bypasses WordPress' real-MIME check (see
 * UploadModule::checkFiletypeAndExt), executable/script extensions are refused
 * outright so an added type can never become a code-execution vector.
 */
class UploadsSettings extends SettingsAbstract
{
    protected const OPTION_KEY = 'kizlo_settings_uploads';

    /**
     * Extensions that can never be enabled, regardless of what is submitted.
     *
     * These are executable, server-parsed, or markup types whose upload would
     * be a remote-code-execution or stored-XSS risk once the real-MIME check is
     * bypassed for allowed types.
     *
     * @var array<int, string>
     */
    public const DENIED_EXTENSIONS = [
        'php', 'php2', 'php3', 'php4', 'php5', 'php6', 'php7', 'php8',
        'phtml', 'pht', 'phps', 'phar', 'phpt',
        'cgi', 'pl', 'py', 'rb', 'sh', 'bash', 'ksh', 'zsh',
        'exe', 'com', 'bat', 'cmd', 'msi', 'scr', 'dll', 'jar',
        'js', 'mjs', 'cjs', 'jsp', 'asp', 'aspx',
        'html', 'htm', 'xhtml', 'shtml', 'shtm',
        'htaccess', 'htpasswd', 'ini', 'so',
    ];

    protected array $data = [
        'allowed_mimes' => [
            ['ext' => 'svg', 'mime' => 'image/svg+xml'],
            ['ext' => 'ico', 'mime' => 'image/x-icon'],
        ],
    ];

    /**
     * The extension/MIME pairs the user has enabled for upload.
     *
     * @return array<int, array{ext: string, mime: string}>
     */
    public function getAllowedMimes(): array
    {
        return $this->get('allowed_mimes') ?? [];
    }

    /**
     * @param array<int, array{ext: string, mime: string}> $value
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
        foreach ($this->getAllowedMimes() as $mime) {
            if ($mime['ext'] === $extension) return true;
        }

        return false;
    }

    /**
     * Enabled types resolved to the `upload_mimes` shape (ext => mime type).
     *
     * @return array<string, string>
     */
    public function getUploadMimes(): array
    {
        $mimes = [];

        foreach ($this->getAllowedMimes() as $mime) {
            $mimes[$mime['ext']] = $mime['mime'];
        }

        return $mimes;
    }

    protected function sanitize(string $key, mixed $value): mixed
    {
        return match ($key) {
            'allowed_mimes' => $this->sanitizeAllowedMimes($value),
            default         => $value,
        };
    }

    /**
     * Keep only well-formed, non-dangerous, de-duplicated {ext, mime} pairs.
     *
     * @return array<int, array{ext: string, mime: string}>
     */
    private function sanitizeAllowedMimes(mixed $value): array
    {
        if (!is_array($value)) return [];

        $clean = [];
        $seen  = [];

        foreach ($value as $row) {
            if (!is_array($row)) continue;

            $ext  = sanitize_key((string) ($row['ext'] ?? ''));
            $mime = $this->sanitizeMimeType((string) ($row['mime'] ?? ''));

            if ($ext === '' || $mime === '') continue;
            if (in_array($ext, self::DENIED_EXTENSIONS, true)) continue;
            if (isset($seen[$ext])) continue;

            $seen[$ext] = true;
            $clean[]    = ['ext' => $ext, 'mime' => $mime];
        }

        return $clean;
    }

    /**
     * Normalise and validate a `type/subtype` MIME string; empty when invalid.
     */
    private function sanitizeMimeType(string $mime): string
    {
        $mime = strtolower(trim($mime));

        return preg_match('~^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$~', $mime) === 1
            ? $mime
            : '';
    }
}
