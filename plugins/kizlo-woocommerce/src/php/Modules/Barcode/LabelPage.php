<?php

namespace Kizlo\WooCommerce\Modules\Barcode;

use WC_Product;
use WP_Post;

final class LabelPage
{
    public const SLUG = 'kizlo-barcode-labels';
    public const MAX_PRODUCTS = 200;

    public function register(): void
    {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
        add_action('admin_footer', [$this, 'dialog']);
        add_action('wp_ajax_kizlo_regenerate_barcodes', [$this, 'handleAction']);
        add_action('wp_ajax_kizlo_generate_barcodes', [$this, 'handleAction']);
        add_filter('bulk_actions-edit-product', [$this, 'bulkActions']);
        add_filter('handle_bulk_actions-edit-product', [$this, 'handleBulkAction'], 10, 3);
        add_filter('post_row_actions', [$this, 'rowActions'], 10, 2);
    }

    public function enqueue(): void
    {
        $labels = ($_GET['page'] ?? '') === self::SLUG;
        $screen = get_current_screen();
        $actions = $screen && $screen->post_type === 'product' && in_array($screen->base, ['edit', 'post'], true);
        if (!$labels && !$actions) return;

        wp_enqueue_style('kizlo-barcode-labels', KIZLO_WOOCOMMERCE_URL . 'src/assets/barcode-labels.css', [], KIZLO_WOOCOMMERCE_VERSION . '-' . filemtime(KIZLO_WOOCOMMERCE_PATH . 'src/assets/barcode-labels.css'));
        if ($labels) wp_enqueue_script('kizlo-barcode-labels', KIZLO_WOOCOMMERCE_URL . 'src/assets/barcode-labels.js', [], KIZLO_WOOCOMMERCE_VERSION . '-' . filemtime(KIZLO_WOOCOMMERCE_PATH . 'src/assets/barcode-labels.js'), true);
        if ($actions) {
            wp_enqueue_script('kizlo-barcode-actions', KIZLO_WOOCOMMERCE_URL . 'src/assets/barcode-actions.js', [], KIZLO_WOOCOMMERCE_VERSION . '-' . filemtime(KIZLO_WOOCOMMERCE_PATH . 'src/assets/barcode-actions.js'), true);
            wp_localize_script('kizlo-barcode-actions', 'kizloBarcodeActions', [
                'url' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('kizlo_barcode_action'),
                'error' => __('Could not update barcodes. Try again.', 'kizlo-woocommerce'),
                'generateTitle' => __('Generate barcodes?', 'kizlo-woocommerce'),
                'generateLabel' => __('Generate barcodes', 'kizlo-woocommerce'),
                'regenerateTitle' => __('Regenerate barcodes?', 'kizlo-woocommerce'),
                'regenerateLabel' => __('Regenerate barcodes', 'kizlo-woocommerce'),
            ]);
        }
    }

    public function dialog(): void
    {
        if (wp_script_is('kizlo-barcode-actions', 'enqueued')) require __DIR__ . '/views/regeneration-dialog.php';
    }

    public function handleAction(): void
    {
        check_ajax_referer('kizlo_barcode_action', 'kizlo_barcode_action_nonce');
        try {
            $action = $_POST['action'] ?? '';
            if (!in_array($action, ['kizlo_generate_barcodes', 'kizlo_regenerate_barcodes'], true)) {
                throw new \RuntimeException(__('Invalid barcode action.', 'kizlo-woocommerce'));
            }
            $generating = $action === 'kizlo_generate_barcodes';
            $input = $_POST['products'] ?? '';
            $ids = is_string($input) && $input !== '' ? explode(',', wp_unslash($input)) : [];
            $products = $this->products($ids);
            if (!$products) throw new \RuntimeException(__('Select products to update their barcodes.', 'kizlo-woocommerce'));
            if (($_POST['phase'] ?? '') === 'prepare') {
                $existing = count(array_filter($products, static fn(WC_Product $product): bool => Barcode::value($product) !== null));
                $missing = count($products) - $existing;
                if (!$generating && !$existing) {
                    throw new \RuntimeException(__('These products have no barcodes. Use Generate barcodes to assign them.', 'kizlo-woocommerce'));
                }
                wp_send_json_success(self::review($products, $action) + [
                    'missing' => $missing,
                    'message' => $missing === 0
                        ? sprintf(_n('This item already has a barcode. Choose Regenerate barcodes to replace it.', 'All %d selected items already have barcodes. Choose Regenerate barcodes to replace them.', $existing, 'kizlo-woocommerce'), $existing)
                        : sprintf(_n('%d item will get a barcode.', '%d items will get a barcode.', $missing, 'kizlo-woocommerce'), $missing)
                            . ' ' . sprintf(_n('%d item already has one and will stay unchanged.', '%d items already have one and will stay unchanged.', $existing, 'kizlo-woocommerce'), $existing),
                ]);
            }
            $review = self::verifiedReview($products, $action);
            if ($generating) {
                if (array_map([Barcode::class, 'snapshot'], $products) !== $review) {
                    throw new \RuntimeException(__('The selected barcodes changed. Check the counts and confirm again.', 'kizlo-woocommerce'));
                }
                $result = ['assigned' => 0, 'skipped' => 0, 'failures' => []];
                foreach ($products as $index => $product) {
                    try {
                        if (Barcode::assign($product, $review[$index]['type'])) $result['assigned']++;
                        else $result['skipped']++;
                    } catch (\InvalidArgumentException | \RuntimeException | \WC_Data_Exception $exception) {
                        $result['failures'][$product->get_id()] = $exception->getMessage();
                    }
                }
                $message = sprintf(_n('Assigned %d barcode.', 'Assigned %d barcodes.', $result['assigned'], 'kizlo-woocommerce'), $result['assigned']);
                if ($result['skipped']) $message .= ' ' . sprintf(_n('Kept %d existing barcode unchanged.', 'Kept %d existing barcodes unchanged.', $result['skipped'], 'kizlo-woocommerce'), $result['skipped']);
            } else {
                $result = Barcode::regenerate($products, $review);
                $message = sprintf(_n('Replaced %d barcode. Reprint and replace the old labels.', 'Replaced %d barcodes. Reprint and replace the old labels.', $result['replaced'], 'kizlo-woocommerce'), $result['replaced']);
                if ($result['skipped']) $message .= ' ' . sprintf(__('Skipped %d items without a barcode.', 'kizlo-woocommerce'), $result['skipped']);
            }
            if ($result['failures']) $message .= ' ' . implode(' ', array_unique($result['failures']));
            wp_send_json_success([
                'message' => $message, 'failed' => (bool) $result['failures'],
                'products' => array_map(static fn(WC_Product $product): array => Barcode::snapshot($product) + ['editorNonce' => Barcode::editorNonce($product)], $this->products($ids)),
            ]);
        } catch (\RuntimeException $exception) {
            wp_send_json_error(['message' => $exception->getMessage()]);
        }
    }

    public function menu(): void
    {
        // Keep product-action URLs registered without a standalone navigation entry.
        add_submenu_page('edit.php?post_type=product', __('Barcode labels', 'kizlo-woocommerce'), __('Barcode labels', 'kizlo-woocommerce'), 'edit_products', self::SLUG, [$this, 'render']);
        remove_submenu_page('edit.php?post_type=product', self::SLUG);
    }

    public function bulkActions(array $actions): array
    {
        $actions['kizlo_generate_barcodes'] = __('Generate barcodes', 'kizlo-woocommerce');
        $actions['kizlo_regenerate_barcodes'] = __('Regenerate barcodes', 'kizlo-woocommerce');
        $actions['kizlo_barcode_labels'] = __('Print barcode labels', 'kizlo-woocommerce');

        return $actions;
    }

    public function handleBulkAction(string $redirect, string $action, array $ids): string
    {
        return $action === 'kizlo_barcode_labels' ? self::url($ids) : $redirect;
    }

    public function rowActions(array $actions, WP_Post $post): array
    {
        if ($post->post_type === 'product' && current_user_can('edit_post', $post->ID)) {
            $actions['kizlo_regenerate_barcodes'] = '<button type="button" class="button-link" data-kizlo-regenerate="' . esc_attr((string) $post->ID) . '">' . esc_html__('Regenerate barcodes', 'kizlo-woocommerce') . '</button>';
            $actions['kizlo_barcode_labels'] = '<a href="' . esc_url(self::url([$post->ID])) . '">' . esc_html__('Barcode labels', 'kizlo-woocommerce') . '</a>';
        }

        return $actions;
    }

    public static function url(array $ids): string
    {
        return add_query_arg([
            'post_type' => 'product',
            'page' => self::SLUG,
            'products' => implode(',', array_map('absint', $ids)),
        ], admin_url('edit.php'));
    }

    /** Validate the entire selection before permitting any writes. @return WC_Product[] */
    public function products(array $ids): array
    {
        if (!current_user_can('edit_products')) {
            throw new \RuntimeException(__('You cannot edit products.', 'kizlo-woocommerce'));
        }
        if (count($ids) > self::MAX_PRODUCTS) {
            throw new \RuntimeException(__('Select at most 200 products or variations per batch.', 'kizlo-woocommerce'));
        }

        $products = [];
        foreach (array_unique(array_map('absint', $ids)) as $id) {
            $product = wc_get_product($id);
            if (!$product || $product->get_status('edit') === 'trash' || !current_user_can('edit_post', $id)) {
                throw new \RuntimeException(__('A selected product is unavailable or you cannot edit it.', 'kizlo-woocommerce'));
            }
            $children = $product->is_type('variable') ? $product->get_children() : [$id];
            foreach ($children as $childId) {
                $child = wc_get_product($childId);
                if (!$child || !Barcode::supports($child) || !current_user_can('edit_post', $childId)) {
                    throw new \RuntimeException(__('Labels support editable simple products and individual variations.', 'kizlo-woocommerce'));
                }
                $products[$childId] = $child;
                if (count($products) > self::MAX_PRODUCTS) {
                    throw new \RuntimeException(__('This selection contains more than 200 variations. Select smaller batches.', 'kizlo-woocommerce'));
                }
            }
        }

        return array_values($products);
    }

    public static function review(array $products, string $action = 'kizlo_regenerate_barcodes'): array
    {
        $payload = wp_json_encode(array_map([Barcode::class, 'snapshot'], $products));
        if (!is_string($payload)) throw new \RuntimeException(__('Could not prepare barcode confirmation.', 'kizlo-woocommerce'));
        return ['payload' => $payload, 'signature' => hash_hmac('sha256', $action . ':' . get_current_user_id() . ':' . $payload, wp_salt('nonce'))];
    }

    private static function verifiedReview(array $products, string $action): array
    {
        $payload = $_POST['kizlo_barcode_review'] ?? null;
        $signature = $_POST['kizlo_barcode_signature'] ?? null;
        if (($_POST['kizlo_confirm_barcode_action'] ?? '') !== 'yes' || !is_string($payload) || !is_string($signature)) {
            throw new \RuntimeException(__('Confirm this barcode action before continuing.', 'kizlo-woocommerce'));
        }
        $payload = wp_unslash($payload);
        $signature = wp_unslash($signature);
        if (strlen($payload) > 128000 || !hash_equals(hash_hmac('sha256', $action . ':' . get_current_user_id() . ':' . $payload, wp_salt('nonce')), $signature)) {
            throw new \RuntimeException(__('Invalid barcode confirmation. Reload the selection and review it again.', 'kizlo-woocommerce'));
        }
        $review = json_decode($payload, true);
        if (!is_array($review) || array_column($review, 'id') !== array_map(static fn(WC_Product $product): int => $product->get_id(), $products)) {
            throw new \RuntimeException(__('The barcode selection changed. Review it again.', 'kizlo-woocommerce'));
        }
        return $review;
    }

    public function render(): void
    {
        $input = $_GET['products'] ?? '';
        $ids = is_string($input) && $input !== '' ? explode(',', wp_unslash($input)) : [];
        $error = null;
        $generated = 0;
        $skipped = 0;
        $failures = [];
        $products = [];
        try {
            $products = $this->products($ids);
            if (isset($_POST['kizlo_generate_barcodes'])) {
                check_admin_referer('kizlo_generate_barcodes');
                foreach ($products as $product) {
                    try {
                        if (Barcode::assign($product)) $generated++;
                        else $skipped++;
                    } catch (\InvalidArgumentException | \RuntimeException | \WC_Data_Exception $exception) {
                        $failures[$product->get_id()] = $exception->getMessage();
                    }
                }
            }
            // Mutation helpers use fresh CRUD objects; render their persisted values and saved types.
            $products = $this->products($ids);
        } catch (\RuntimeException $exception) {
            $error = $exception->getMessage();
            try { $products = $this->products($ids); }
            catch (\RuntimeException) { $products = []; }
        }

        $items = [];
        foreach ($products as $product) {
            $value = Barcode::value($product);
            $image = null;
            $imageError = $failures[$product->get_id()] ?? null;
            $type = Barcode::type($product) ?? ($value === null ? Settings::defaultType() : null);
            if ($value !== null) {
                try {
                    if ($type === null) throw new \InvalidArgumentException(__('Choose a compatible barcode type in the product editor before printing.', 'kizlo-woocommerce'));
                    $image = Barcode::image($value, $type);
                } catch (\InvalidArgumentException $exception) {
                    $imageError = $exception->getMessage();
                }
            }
            $items[] = [
                'id' => $product->get_id(), 'name' => wp_strip_all_tags($product->get_name()),
                'code' => $value, 'type' => $type,
                'modules' => $image['modules'] ?? 0, 'quiet' => $image['quiet'] ?? 0,
                'minWidth' => $image['minWidth'] ?? 0, 'barHeight' => $image['barHeight'] ?? 0,
                'image' => $image ? 'data:image/svg+xml;base64,' . base64_encode($image['svg']) : null,
                'error' => $imageError,
            ];
        }
        $layout = Settings::layout();
        require __DIR__ . '/views/labels.php';
    }
}
