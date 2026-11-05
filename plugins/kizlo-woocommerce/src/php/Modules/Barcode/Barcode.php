<?php

namespace Kizlo\WooCommerce\Modules\Barcode;

use Picqer\Barcode\Renderers\SvgRenderer;
use Picqer\Barcode\Types\{TypeCode128, TypeCode39, TypeEan13, TypeEan8, TypeUpcA};
use WC_Product;

final class Barcode
{
    public const LEGACY_KEY = '_kizlo_barcode';
    public const SEQUENCE_OPTION = 'kizlo_woocommerce_barcode_sequence_';
    public const TYPE_KEY = '_kizlo_barcode_type';
    public const TYPES = ['ean13' => 'EAN-13', 'upc_a' => 'UPC-A', 'ean8' => 'EAN-8', 'code128' => 'Code 128', 'code39' => 'Code 39'];

    public static function supports(WC_Product $product): bool
    {
        return $product->is_type(['simple', 'variation']);
    }

    public static function value(WC_Product $product): ?string
    {
        if (!self::supports($product)) return null;
        $value = $product->get_global_unique_id('edit');
        return $value !== '' ? $value : null;
    }

    public static function type(WC_Product $product): ?string
    {
        $stored = $product->get_meta(self::TYPE_KEY, true, 'edit');
        if (is_string($stored) && $stored !== '') return isset(self::TYPES[$stored]) ? $stored : null;
        $value = self::value($product);
        if ($value === null) return null;
        // Eight digits can also be UPC-E: a merchant must select that type explicitly.
        foreach (['ean13' => 13, 'upc_a' => 12] as $type => $length) {
            if (strlen($value) === $length && ctype_digit($value) && self::checksum(substr($value, 0, -1)) === substr($value, -1)) return $type;
        }
        return null;
    }

    public static function checksum(string $body): string
    {
        $sum = 0;
        for ($i = strlen($body) - 1, $weight = 3; $i >= 0; $i--, $weight = 4 - $weight) {
            $sum += (int) $body[$i] * $weight;
        }
        return (string) ((10 - $sum % 10) % 10);
    }

    public static function number(int $sequence, string $type): string
    {
        self::validateType($type);
        [$prefix, $capacity] = match ($type) {
            'upc_a' => ['4', 10],
            'ean8' => ['2', 6],
            default => ['04', 10],
        };
        if ($sequence < 1 || strlen((string) $sequence) > $capacity) {
            throw new \InvalidArgumentException(sprintf(__('Barcode sequence exceeds %s capacity. Choose a larger barcode format.', 'kizlo-woocommerce'), self::TYPES[$type]));
        }
        $body = $prefix . str_pad((string) $sequence, $capacity, '0', STR_PAD_LEFT);
        return $body . self::checksum($body);
    }

    public static function validateType(string $type): void
    {
        if (!isset(self::TYPES[$type])) throw new \InvalidArgumentException(__('Choose a supported barcode type.', 'kizlo-woocommerce'));
    }

    public static function validate(string $value, string $type): void
    {
        self::validateType($type);
        $length = match ($type) { 'ean13' => 13, 'upc_a' => 12, 'ean8' => 8, default => null };
        if ($length !== null) {
            if (!ctype_digit($value) || strlen($value) !== $length) {
                throw new \InvalidArgumentException(sprintf(__('%s requires exactly %d digits, including the check digit.', 'kizlo-woocommerce'), self::TYPES[$type], $length));
            }
            if (self::checksum(substr($value, 0, -1)) !== substr($value, -1)) {
                throw new \InvalidArgumentException(__('Invalid barcode check digit. Correct the identifier in the product editor.', 'kizlo-woocommerce'));
            }
        } elseif (!preg_match($type === 'code39' ? '/\A[0-9A-Z .\-+$\/%]{1,64}\z/D' : '/\A[\x20-\x7E]{1,64}\z/D', $value)) {
            throw new \InvalidArgumentException(__('Code 128 requires 1–64 printable ASCII characters; Code 39 allows uppercase letters, digits, spaces and - . $ / + %.', 'kizlo-woocommerce'));
        }
    }

    /** UPC-A and its leading-zero EAN-13 form identify the same item. */
    public static function equivalents(string $value): array
    {
        if (ctype_digit($value) && strlen($value) === 12) return [$value, '0' . $value];
        if (ctype_digit($value) && strlen($value) === 13 && $value[0] === '0') return [$value, substr($value, 1)];
        return [$value];
    }

    private static function conflict(string $value, int $id): ?int
    {
        global $wpdb;
        $values = self::equivalents($value);
        $placeholders = implode(',', array_fill(0, count($values), '%s'));
        $conflict = $wpdb->get_var($wpdb->prepare(
            "SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
             WHERE p.ID != %d AND p.post_type IN ('product','product_variation')
             AND m.meta_key IN ('_kizlo_barcode','_global_unique_id') AND m.meta_value IN ($placeholders) LIMIT 1",
            $id, ...$values
        ));
        if ($wpdb->last_error !== '') throw new \RuntimeException(__('Could not check barcode uniqueness. Retry the request.', 'kizlo-woocommerce'));
        return $conflict ? (int) $conflict : null;
    }

    private static function locked(callable $operation): mixed
    {
        global $wpdb;
        $lock = 'kizlo_barcode_' . substr(hash('sha256', $wpdb->postmeta), 0, 40);
        if ((string) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, %d)', $lock, 5)) !== '1') {
            throw new \RuntimeException(__('Barcode assignment is busy. Retry the request.', 'kizlo-woocommerce'));
        }
        try { return $operation(); }
        finally { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock)); }
    }

    private static function fresh(int $id): WC_Product
    {
        // Native properties use WordPress's meta cache, which can predate another request's lock.
        wp_cache_delete($id, 'post_meta');
        $product = wc_get_product($id);
        if (!$product || !self::supports($product) || $product->get_status('edit') === 'trash') {
            throw new \RuntimeException(__('This product is no longer available for barcode assignment.', 'kizlo-woocommerce'));
        }
        $product->read_meta_data(true);
        return $product;
    }

    /** The signed review binds both the current identity and the format that will be assigned. */
    public static function snapshot(WC_Product $product): array
    {
        return ['id' => $product->get_id(), 'value' => self::value($product), 'type' => self::type($product) ?? Settings::defaultType()];
    }

    /** Only called under the assignment lock. Counters never move backwards or recycle retired codes. */
    private static function next(string $type, int $id, ?string $old): string
    {
        global $wpdb;
        self::validateType($type);
        $short = $type === 'ean8';
        $option = self::SEQUENCE_OPTION . ($short ? 'ean8' : 'retail');
        $expression = $short
            ? "CASE WHEN meta_value REGEXP '^2[0-9]{7}$' THEN CAST(SUBSTRING(meta_value, 2, 6) AS UNSIGNED) ELSE 0 END"
            : "CASE WHEN meta_value REGEXP '^04[0-9]{11}$' THEN CAST(SUBSTRING(meta_value, 3, 10) AS UNSIGNED) WHEN meta_value REGEXP '^4[0-9]{11}$' THEN CAST(SUBSTRING(meta_value, 2, 10) AS UNSIGNED) ELSE 0 END";
        $last = $wpdb->get_var($wpdb->prepare(
            "SELECT COALESCE((SELECT option_value FROM {$wpdb->options} WHERE option_name = %s),
             (SELECT MAX($expression) FROM {$wpdb->postmeta} WHERE meta_key IN ('_global_unique_id','_kizlo_barcode')), 0)", $option
        ));
        if ($wpdb->last_error !== '') throw new \RuntimeException(__('Could not read barcode numbering. Retry the request.', 'kizlo-woocommerce'));
        $last = (int) $last;
        if ($old !== null) {
            $canonical = self::equivalents($old);
            foreach ($canonical as $value) {
                if (preg_match($short ? '/\A2[0-9]{7}\z/D' : '/\A04[0-9]{11}\z/D', $value)) {
                    $last = max($last, (int) substr($value, $short ? 1 : 2, $short ? 6 : 10));
                }
            }
        }
        for ($attempt = 0; $attempt < 100; $attempt++) {
            $value = self::number(++$last, $type);
            // Reserve before persistence: a failed write may leave a gap, never a reusable identity.
            wp_cache_delete($option, 'options');
            wp_cache_delete('notoptions', 'options');
            if (!update_option($option, $last, false)) throw new \RuntimeException(__('Could not reserve a barcode number. Retry the request.', 'kizlo-woocommerce'));
            if (($old === null || !array_intersect(self::equivalents($old), self::equivalents($value))) && self::conflict($value, $id) === null) return $value;
        }
        throw new \RuntimeException(__('No unused barcode was found. Resolve conflicting identifiers and retry.', 'kizlo-woocommerce'));
    }

    private static function write(WC_Product $product, string $type): string
    {
        $value = self::next($type, $product->get_id(), self::value($product));
        $product->set_global_unique_id($value);
        $product->update_meta_data(self::TYPE_KEY, $type);
        $product->save();
        $saved = self::fresh($product->get_id());
        if (self::value($saved) !== $value || self::type($saved) !== $type) throw new \RuntimeException(__('The barcode could not be saved. Reload the product before retrying.', 'kizlo-woocommerce'));
        return $value;
    }

    public static function assign(WC_Product $product, ?string $type = null): bool
    {
        if (!$product->get_id() || !self::supports($product)) return false;
        return self::locked(static function () use ($product, $type): bool {
            $saved = self::fresh($product->get_id());
            if (self::value($saved) !== null || self::value($product) !== null) return false;
            if ($saved->get_meta(self::LEGACY_KEY, true, 'edit') !== '') throw new \RuntimeException(__('Move this draft barcode to the native field before assigning a new one.', 'kizlo-woocommerce'));
            $value = self::write($saved, $type ?? Settings::defaultType());
            $product->set_global_unique_id($value);
            return true;
        });
    }

    /** Validate the whole signed selection under one lock before replacing any identity. */
    public static function regenerate(array $products, array $review): array
    {
        return self::locked(static function () use ($products, $review): array {
            $fresh = [];
            foreach ($products as $product) {
                $item = self::fresh($product->get_id());
                if (!current_user_can('edit_post', $item->get_id())) throw new \RuntimeException(__('You cannot edit a selected product.', 'kizlo-woocommerce'));
                $fresh[] = $item;
            }
            if (array_map([self::class, 'snapshot'], $fresh) !== $review) {
                throw new \RuntimeException(__('This selection changed or was already regenerated. Review the current barcodes and confirm again.', 'kizlo-woocommerce'));
            }
            $result = ['replaced' => 0, 'skipped' => 0, 'failures' => []];
            foreach ($fresh as $index => $product) {
                if (self::value($product) === null) { $result['skipped']++; continue; }
                try {
                    self::write($product, $review[$index]['type']);
                    $result['replaced']++;
                } catch (\InvalidArgumentException | \RuntimeException | \WC_Data_Exception $exception) {
                    $result['failures'][$product->get_id()] = $exception->getMessage();
                }
            }
            return $result;
        });
    }

    public static function saveType(WC_Product $product, string $type): void
    {
        if (!$product->get_id() || !self::supports($product)) return;
        self::validateType($type);
        self::locked(static function () use ($product, $type): void {
            $saved = self::fresh($product->get_id());
            $value = self::value($product);
            if ($value === null) return;
            self::validate($value, $type);
            if (($conflict = self::conflict($value, $product->get_id())) !== null) throw new \RuntimeException(sprintf(__('Barcode already belongs to item #%d. Resolve the duplicate identifier first.', 'kizlo-woocommerce'), $conflict));
            $saved->update_meta_data(self::TYPE_KEY, $type);
            $saved->save_meta_data();
        });
    }

    /** @return array{svg: string, modules: int, quiet: int, minWidth: float, barHeight: float} */
    public static function image(string $value, string $type = 'code128'): array
    {
        self::validate($value, $type);
        $encoder = match ($type) {
            'ean13' => new TypeEan13(), 'upc_a' => new TypeUpcA(), 'ean8' => new TypeEan8(),
            'code39' => new TypeCode39(), default => new TypeCode128(),
        };
        $barcode = $encoder->getBarcode($value);
        $renderer = new SvgRenderer();
        $renderer->setSvgType(SvgRenderer::TYPE_SVG_INLINE);
        $retail = in_array($type, ['ean13', 'upc_a', 'ean8'], true);
        return [
            // Width and height are set independently in millimetres on the print page.
            'svg' => str_replace('<svg ', '<svg preserveAspectRatio="none" ', $renderer->render($barcode, $barcode->getWidth(), 100)),
            'modules' => $barcode->getWidth(),
            'quiet' => $retail ? 11 : 10,
            'minWidth' => $retail ? 0.264 : 0.25,
            'barHeight' => match ($type) { 'ean13', 'upc_a' => 18.28, 'ean8' => 14.58, default => 12.0 },
        ];
    }
}
