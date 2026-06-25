<?php

namespace Kizlo\WooCommerce;

use Kizlo\WooCommerce\Modules\Admin\AttributeSwatch;
use Kizlo\WooCommerce\Modules\Cart\CartModule;
use Kizlo\WooCommerce\Modules\Customer\CustomerModule;
use Kizlo\WooCommerce\Modules\Integration\CoreIntegration;
use Kizlo\WooCommerce\Modules\Order\OrderModule;
use Kizlo\WooCommerce\Modules\Product\ProductModule;
use Kizlo\WooCommerce\Modules\Variation\VariationListener;
use Kizlo\WooCommerce\Modules\WooCommerce\WooCommerceModule;

class Plugin
{
    private static ?Plugin $instance = null;

    /**
     * @var array<int, class-string>
     */
    private array $modules = [
        CoreIntegration::class,
        WooCommerceModule::class,
        ProductModule::class,
        OrderModule::class,
        CustomerModule::class,
        CartModule::class,
        AttributeSwatch::class,
        VariationListener::class,
    ];

    private function __construct() {}

    public static function instance(): Plugin
    {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    public function boot(): void
    {
        foreach ($this->modules as $module) {
            (new $module())->register();
        }
    }
}
