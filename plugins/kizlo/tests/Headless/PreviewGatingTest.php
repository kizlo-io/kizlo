<?php

namespace Kizlo\Tests\Headless;

use Kizlo\Modules\Preview\PreviewModule;

/**
 * Preview gating: the editor-hijacking hooks register only when Headless preview
 * is on; otherwise the native WordPress preview is left in place.
 */
class PreviewGatingTest extends HeadlessTestCase
{
    private function bootPreview(array $headless): PreviewModule
    {
        $this->seedHeadless($headless);

        $module = new PreviewModule();
        $module->register();

        return $module;
    }

    public function test_preview_on_registers_the_editor_hijack(): void
    {
        $module = $this->bootPreview(['enabled' => true, 'preview' => true]);

        $this->assertNotFalse(has_action('enqueue_block_editor_assets', [$module, 'enqueueEditorAssets']));
        $this->assertNotFalse(has_action('admin_enqueue_scripts', [$module, 'enqueueScripts']));
        $this->assertNotFalse(has_action('post_submitbox_misc_actions', [$module, 'ajaxCaller']));
    }

    public function test_preview_off_leaves_native_preview_intact(): void
    {
        $module = $this->bootPreview(['enabled' => true, 'preview' => false]);

        $this->assertFalse(has_action('enqueue_block_editor_assets', [$module, 'enqueueEditorAssets']));
        $this->assertFalse(has_action('admin_enqueue_scripts', [$module, 'enqueueScripts']));
        $this->assertFalse(has_action('post_submitbox_misc_actions', [$module, 'ajaxCaller']));
    }

    public function test_master_off_leaves_native_preview_intact(): void
    {
        $module = $this->bootPreview(['enabled' => false, 'preview' => true]);

        $this->assertFalse(has_action('enqueue_block_editor_assets', [$module, 'enqueueEditorAssets']));
    }

    public function test_ajax_handler_is_always_registered(): void
    {
        $module = $this->bootPreview(['enabled' => true, 'preview' => false]);

        $this->assertNotFalse(has_action('wp_ajax_kizlo_preview_token', [$module, 'ajaxHandler']));
    }
}
