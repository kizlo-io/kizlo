<?php

namespace Kizlo\Support;

class Asset
{
    /**
     * Enqueue a module's script and (if present) style by deriving build paths
     * from the module's fully-qualified class name.
     *
     * @param string $handle Script + style handle.
     * @param string $module FQCN of a Module class, e.g. Kizlo\Modules\Settings\SettingsModule.
     * @param array  $data   Optional data emitted before the script as `window.kizlo = {...}`.
     */
    public static function enqueue(string $handle, string $module, array $data = []): void
    {
        $parts = explode('\\', $module);
        $name = strtolower($parts[2]);
        $base = "build/modules/{$name}/index";

        $asset_file = KIZLO_PATH . "{$base}.asset.php";
        if (! file_exists($asset_file)) return;

        $asset = require $asset_file;

        wp_enqueue_script($handle, KIZLO_URL . "{$base}.js", $asset['dependencies'], $asset['version'], true);

        if (file_exists(KIZLO_PATH . "{$base}.css")) {
            wp_enqueue_style($handle, KIZLO_URL . "{$base}.css", [], $asset['version']);
        }

        if (! empty($data)) {
            wp_add_inline_script($handle, 'window.kizlo = ' . wp_json_encode($data) . ';', 'before');
        }
    }
}
