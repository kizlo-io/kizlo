<?php

namespace Kizlo\WooCommerce\Modules\Checkout;

use Kizlo\Modules\Settings\Settings;
use Kizlo\Support\Utils;
use WC_Admin_Settings;
use WC_Order;

class CheckoutRedirectModule
{
    private const TAB_ID = 'kizlo';

    private const OPTION_ENABLED = 'kizlo_wc_checkout_redirect_enabled';

    private const OPTION_PATH = 'kizlo_wc_checkout_order_received_path';

    private const DEFAULT_PATH = '/checkout/order-received';

    public function register(): void
    {
        add_filter('woocommerce_settings_tabs_array', [$this, 'addSettingsTab'], 50);
        add_action('woocommerce_settings_tabs_' . self::TAB_ID, [$this, 'renderSettings']);
        add_action('woocommerce_update_options_' . self::TAB_ID, [$this, 'saveSettings']);
        add_filter('woocommerce_get_checkout_order_received_url', [$this, 'redirectOrderReceivedUrl'], 10, 2);
        add_filter('allowed_redirect_hosts', [$this, 'allowFrontendRedirectHost']);
    }

    /**
     * @param  array<string, string> $tabs
     * @return array<string, string>
     */
    public function addSettingsTab(array $tabs): array
    {
        $tabs[self::TAB_ID] = __('Kizlo', 'kizlo-woocommerce');

        return $tabs;
    }

    public function renderSettings(): void
    {
        woocommerce_admin_fields($this->settingsFields());
    }

    public function saveSettings(): void
    {
        WC_Admin_Settings::save_fields($this->settingsFields());
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function settingsFields(): array
    {
        return [
            [
                'type' => 'title',
                'id'   => 'kizlo_wc_checkout_options',
                'name' => __('Checkout', 'kizlo-woocommerce'),
            ],
            [
                'type'    => 'checkbox',
                'id'      => self::OPTION_ENABLED,
                'name'    => __('Redirect checkout to the headless frontend', 'kizlo-woocommerce'),
                'desc'    => __('Send shoppers to the Kizlo Site URL after checkout instead of the WordPress order-received page.', 'kizlo-woocommerce'),
                'default' => 'no',
            ],
            [
                'type'        => 'text',
                'id'          => self::OPTION_PATH,
                'name'        => __('Order-received path', 'kizlo-woocommerce'),
                'desc'        => __('Path on the frontend that receives the order. The order_id and key are appended as query arguments.', 'kizlo-woocommerce'),
                'default'     => self::DEFAULT_PATH,
                'placeholder' => self::DEFAULT_PATH,
            ],
            [
                'type' => 'sectionend',
                'id'   => 'kizlo_wc_checkout_options_end',
            ],
        ];
    }

    /**
     * @param  string   $url
     * @param  WC_Order $order
     * @return string
     */
    public function redirectOrderReceivedUrl(string $url, WC_Order $order): string
    {
        $settings = $this->frontendSettings();

        if ($settings === null) {
            return $url;
        }

        $path = get_option(self::OPTION_PATH, self::DEFAULT_PATH);
        $path = is_string($path) && trim($path, '/') !== '' ? $path : self::DEFAULT_PATH;

        return add_query_arg([
            'order_id' => $order->get_id(),
            'key'      => $order->get_order_key(),
        ], $settings->resolveUrl($settings->getBaseUrl(), $path));
    }

    /**
     * WooCommerce sends off-site gateway returns to the order-received URL with
     * wp_safe_redirect(), which rejects any host outside allowed_redirect_hosts.
     * Add the headless frontend host so a cross-host redirect is not blocked.
     *
     * @param  array<int, string> $hosts
     * @return array<int, string>
     */
    public function allowFrontendRedirectHost(array $hosts): array
    {
        $settings = $this->frontendSettings();

        if ($settings === null) {
            return $hosts;
        }

        $host = wp_parse_url($settings->getBaseUrl(), PHP_URL_HOST);

        if (is_string($host) && $host !== '') {
            $hosts[] = $host;
        }

        return $hosts;
    }

    /**
     * The Kizlo settings when the redirect is enabled and a frontend Site URL is
     * configured, or null. getBaseUrl() otherwise falls back to the WordPress
     * home URL, which is not headless, so a missing Site URL means no redirect.
     */
    private function frontendSettings(): ?Settings
    {
        if (get_option(self::OPTION_ENABLED) !== 'yes') {
            return null;
        }

        $settings = Utils::getSettings();

        return $settings->site->getUrl() === null ? null : $settings;
    }
}
