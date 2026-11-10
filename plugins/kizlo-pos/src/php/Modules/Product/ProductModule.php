<?php

namespace Kizlo\Pos\Modules\Product;

use Kizlo\Pos\Support\Permissions;
use Kizlo\Support\Utils;
use Kizlo\Modules\Settings\PostType\PostTypeSettings;
use WC_Product;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class ProductModule
{
    private const SIZE = 24;

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'routes']);
        add_filter('woocommerce_product_data_store_cpt_get_products_query', [$this, 'queryArgs'], 10, 2);
    }

    public function routes(): void
    {
        $page = ['type' => 'integer', 'minimum' => 1, 'maximum' => 1000000, 'default' => 1];
        foreach ([
            '/products' => ['callback' => 'collection', 'args' => ['page' => $page, 'search' => ['type' => 'string', 'maxLength' => 200, 'default' => '']]],
            '/products/(?P<id>\d+)' => ['callback' => 'detail', 'args' => ['id' => ['type' => 'integer', 'minimum' => 1]]],
            '/products/(?P<id>\d+)/variations' => ['callback' => 'variations', 'args' => ['id' => ['type' => 'integer', 'minimum' => 1], 'page' => $page]],
        ] as $route => $options) {
            register_rest_route('kizlo-pos/v1', $route, [
                'methods' => 'GET', 'permission_callback' => [Permissions::class, 'access'],
                'callback' => [$this, $options['callback']], 'args' => $options['args'],
            ]);
        }
    }

    /** Restrict only POS queries; WooCommerce's general search also matches descriptions and partial SKUs. */
    public function queryArgs(array $args, array $vars): array
    {
        if (!isset($vars['kizlo_pos_search'])) return $args;
        $args['has_password'] = false;
        $args['orderby'] = ['title' => 'ASC', 'ID' => 'ASC'];
        if ($vars['kizlo_pos_search'] !== '') {
            $args['s'] = $vars['kizlo_pos_search'];
            $args['search_columns'] = ['post_title'];
            $args['sentence'] = true;
        }
        return $args;
    }

    private function visible(WC_Product|false $product): bool
    {
        if (!$product || $product->get_status() !== 'publish' || !current_user_can('read_product', $product->get_id())) return false;
        $post = get_post($product->get_id());
        if (!$post || $post->post_password !== '') return false;
        if ($product->is_type('variation')) return $this->visible(wc_get_product($product->get_parent_id()));
        return true;
    }

    private function unavailable(): WP_Error
    {
        return new WP_Error('kizlo_pos_product_unavailable', 'This product is no longer available.', ['status' => 404]);
    }

    private function validateQuery(WP_REST_Request $request): ?WP_Error
    {
        foreach (array_keys($request->get_query_params()) as $key) {
            if (!in_array($key, ['search', 'page', '_locale', '_wpnonce', 'rest_route'], true)) {
                return new WP_Error('rest_invalid_param', 'Unsupported product query parameter.', ['status' => 400]);
            }
        }
        return null;
    }

    private function response(array $data): WP_REST_Response
    {
        return new WP_REST_Response($data, 200, ['Cache-Control' => 'private, no-store']);
    }

    public function collection(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        if ($error = $this->validateQuery($request)) return $error;
        $search = trim((string) $request['search']);
        $page = (int) $request['page'];
        $exact = [];
        if ($search !== '') {
            $values = class_exists(\Kizlo\WooCommerce\Modules\Barcode\Barcode::class)
                ? \Kizlo\WooCommerce\Modules\Barcode\Barcode::equivalents($search) : [$search];
            $ids = [wc_get_product_id_by_sku($search)];
            foreach ($values as $value) $ids[] = wc_get_product_id_by_global_unique_id($value);
            foreach (array_unique(array_filter($ids)) as $id) {
                $product = wc_get_product($id);
                if (!$this->visible($product)) continue;
                $parent = $product->is_type('variation') ? wc_get_product($product->get_parent_id()) : $product;
                $key = $parent->get_id();
                if (!isset($exact[$key])) $exact[$key] = $this->card($parent) + ['matched_variations' => []];
                if ($product->is_type('variation')) $exact[$key]['matched_variations'][] = $id;
            }
        }
        $prefix = array_values($exact);
        $start = ($page - 1) * self::SIZE;
        $first = array_slice($prefix, $start, self::SIZE);
        $result = wc_get_products([
            'status' => 'publish', 'limit' => self::SIZE - count($first), 'offset' => max(0, $start - count($prefix)),
            'exclude' => array_keys($exact), 'paginate' => true, 'kizlo_pos_search' => $search,
        ]);
        $cards = [];
        foreach ($result->products as $product) {
            if ($this->visible($product)) $cards[] = $this->card($product) + ['matched_variations' => []];
        }
        return $this->response(['items' => array_merge($first, $cards), 'page' => $page, 'total' => $result->total + count($prefix),
            'has_more' => $start + self::SIZE < $result->total + count($prefix)]);
    }

    public function detail(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        if ($error = $this->validateQuery($request)) return $error;
        $product = wc_get_product((int) $request['id']);
        if (!$this->visible($product)) return $this->unavailable();
        $parent = $product->is_type('variation') ? wc_get_product($product->get_parent_id()) : null;
        $description = $product->get_description() ?: ($parent ? $parent->get_description() : '');
        $description = $description ?: ($parent ?: $product)->get_short_description();
        $detail = array_merge($this->card($product), [
            'description' => $this->text($description),
            'parent_id' => $parent ? $parent->get_id() : null, 'sku' => $this->text($product->get_sku()),
            'url' => $this->publicUrl($parent ?: $product),
        ]);
        $detail['share_text'] = \Kizlo\Pos\Modules\Settings\Settings::caption($detail);
        return $this->response($detail);
    }

    public function variations(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        if ($error = $this->validateQuery($request)) return $error;
        $parent = wc_get_product((int) $request['id']);
        if (!$this->visible($parent) || !$parent->is_type('variable')) return $this->unavailable();
        $page = (int) $request['page'];
        $result = wc_get_products(['status' => 'publish', 'type' => 'variation', 'parent' => $parent->get_id(),
            'limit' => self::SIZE, 'page' => $page, 'paginate' => true, 'kizlo_pos_search' => '']);
        $items = [];
        foreach ($result->products as $product) {
            if ($this->visible($product)) $items[] = $this->card($product);
        }
        return $this->response(['items' => $items, 'page' => $page, 'total' => $result->total, 'has_more' => $page < $result->max_num_pages]);
    }

    private function text(string $value): string
    {
        $value = preg_replace('~<br\b[^>]*>|</(?:p|div|li|h[1-6]|blockquote|tr|td|th)>~i', "\n", strip_shortcodes($value)) ?? '';
        return trim(html_entity_decode(wp_strip_all_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    private function publicUrl(WC_Product $product): ?string
    {
        $post = get_post($product->get_id());
        $url = Utils::getSettings()->resolvePostUrl($post, PostTypeSettings::load('product'));
        $parts = wp_parse_url($url);
        if (!$parts || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host']) ||
            isset($parts['user']) || isset($parts['pass']) || preg_match('~(?:^|/)(?:wp-admin|wp-json|wp-login\.php)(?:/|$)~i', rawurldecode($parts['path'] ?? ''))) return null;
        parse_str($parts['query'] ?? '', $query);
        foreach (array_keys($query) as $key) {
            if (preg_match('~^(?:_?wpnonce|nonce|preview(?:_id|_nonce)?|password|(?:access_)?token|rest_route)$~i', $key)) return null;
        }
        return esc_url_raw($url);
    }

    private function price(WC_Product $product): ?string
    {
        if ($product->get_price() === '') return null;
        if ($product instanceof \WC_Product_Variable) {
            $prices = $product->get_variation_prices(true)['price'];
            if (!$prices) return null;
            $low = min($prices);
            $high = max($prices);
            $formatted = $low === $high ? wc_price($low) : wc_format_price_range($low, $high);
        } else {
            $formatted = wc_price(wc_get_price_to_display($product));
        }
        return $this->text($formatted . $product->get_price_suffix());
    }

    /** @return array<string, mixed> */
    private function card(WC_Product $product): array
    {
        $parent = $product->is_type('variation') ? wc_get_product($product->get_parent_id()) : null;
        $image = absint($product->get_image_id() ?: ($parent ? $parent->get_image_id() : 0));
        $price = $this->price($product);
        return [
            'id' => $product->get_id(), 'name' => $this->text($product->get_name()), 'type' => $product->get_type(),
            'price' => $price, 'stock' => $product->get_stock_status(),
            'image' => $image ? ['url' => wp_get_attachment_image_url($image, 'large') ?: null, 'alt' => $this->text((string) get_post_meta($image, '_wp_attachment_image_alt', true))] : null,
        ];
    }
}
