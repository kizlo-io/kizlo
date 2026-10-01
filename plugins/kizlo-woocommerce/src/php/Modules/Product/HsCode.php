<?php

namespace Kizlo\WooCommerce\Modules\Product;

use WC_Order_Item_Product;
use WC_Product;

final class HsCode
{
    public const PRODUCT_META = 'kizlo_hs_code';

    public const ORDER_ITEM_META = '_kizlo_hs_code';

    public static function forProduct(WC_Product $product): ?string
    {
        return self::normalize($product->get_meta(self::PRODUCT_META, true));
    }

    public static function forOrderItem(WC_Order_Item_Product $item): ?string
    {
        return self::normalize($item->get_meta(self::ORDER_ITEM_META, true));
    }

    private static function normalize(mixed $value): ?string
    {
        if (! is_string($value)) return null;

        $value = trim($value);

        return $value === '' ? null : $value;
    }
}
