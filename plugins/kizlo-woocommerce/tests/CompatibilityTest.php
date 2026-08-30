<?php

namespace Kizlo\WooCommerce\Tests;

use Automattic\WooCommerce\Utilities\FeaturesUtil;

class CompatibilityTest extends TestCase
{
    public function test_plugin_declares_hpos_compatibility(): void
    {
        $features = FeaturesUtil::get_compatible_features_for_plugin(KIZLO_WOOCOMMERCE_BASENAME);

        $this->assertContains('custom_order_tables', $features['compatible']);
        $this->assertNotContains('custom_order_tables', $features['incompatible']);
    }
}
