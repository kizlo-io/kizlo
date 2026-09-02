<?php

namespace Kizlo\WooCommerce\Tests;

use Automattic\WooCommerce\Utilities\FeaturesUtil;

class CompatibilityTest extends TestCase
{
    public function test_plugin_requires_the_core_release_with_the_request_aware_guard(): void
    {
        $headers = get_file_data(KIZLO_WOOCOMMERCE_FILE, ['requires' => 'Kizlo Requires']);

        $this->assertStringContainsString('kizlo 0.14.0', $headers['requires']);
        $this->assertSame('0.14.0', KIZLO_VERSION);
    }

    public function test_plugin_declares_hpos_compatibility(): void
    {
        $features = FeaturesUtil::get_compatible_features_for_plugin(KIZLO_WOOCOMMERCE_BASENAME);

        $this->assertContains('custom_order_tables', $features['compatible']);
        $this->assertNotContains('custom_order_tables', $features['incompatible']);
    }
}
