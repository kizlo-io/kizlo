<?php

namespace Kizlo\WooCommerce\Modules\TaxId;

use Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields;
use Automattic\WooCommerce\Blocks\Package;
use WC_Customer;
use WC_Order;
use WP_Error;
use WP_HTTP_Response;
use WP_REST_Request;
use WP_REST_Response;

/** Owns the canonical billing-only Tax ID field across WooCommerce surfaces. */
class TaxIdModule
{
    public const FIELD_ID = 'kizlo/tax-id';
    public const SETTING_ID = 'kizlo_woocommerce_require_tax_id';
    // Keep activation safe when this extension is loaded before WooCommerce.
    // These are CheckoutFields::BILLING_FIELDS_PREFIX and SHIPPING_FIELDS_PREFIX.
    public const BILLING_META_KEY = '_wc_billing/' . self::FIELD_ID;
    public const SHIPPING_META_KEY = '_wc_shipping/' . self::FIELD_ID;

    public function register(): void
    {
        add_action('woocommerce_init', [$this, 'registerCheckoutField']);
        add_filter('woocommerce_account_settings', [$this, 'addRequirementSetting']);
        add_filter('woocommerce_customer_meta_fields', [$this, 'addCustomerBillingField']);

        // WooCommerce injects registered address fields at priority 10, but only
        // for Store API orders with a non-empty value. Replace that conditional
        // field with one canonical billing field for every order type.
        add_filter('woocommerce_admin_billing_fields', [$this, 'addOrderBillingField'], 20, 3);
        add_filter('woocommerce_admin_shipping_fields', [$this, 'removeOrderShippingField'], 20, 3);
        add_action('woocommerce_store_api_cart_update_customer_from_request', [$this, 'persistCartTaxId'], 20, 2);

        add_filter('rest_request_before_callbacks', [$this, 'validateRetryTaxId'], 20, 3);
        add_action('woocommerce_store_api_checkout_update_order_from_request', [$this, 'persistRetryTaxId'], 20, 2);
        add_filter('rest_post_dispatch', [$this, 'removeStoreApiShippingCopies'], 20, 3);

        // WooCommerce's user editor writes the metadata before these callbacks.
        add_action('personal_options_update', [$this, 'removeCustomerShippingCopy'], 100);
        add_action('edit_user_profile_update', [$this, 'removeCustomerShippingCopy'], 100);
    }

    public function registerCheckoutField(): void
    {
        if (! function_exists('woocommerce_register_additional_checkout_field')) return;

        woocommerce_register_additional_checkout_field([
            'id'                => self::FIELD_ID,
            'label'             => __('Tax ID', 'kizlo-woocommerce'),
            'location'          => 'address',
            'type'              => 'text',
            'required'          => $this->requirementRule(),
            'hidden'            => $this->shippingVisibilityRule(),
            'sanitize_callback' => static fn(mixed $value): string => sanitize_text_field((string) $value),
        ]);
    }

    /** Hide the address field whenever WooCommerce evaluates its shipping context. */
    public function shippingVisibilityRule(): array
    {
        return [
            'customer' => [
                'properties' => [
                    'address' => [
                        'not' => [
                            'required' => ['email'],
                        ],
                    ],
                ],
            ],
        ];
    }

    /**
     * Billing addresses contain email while shipping addresses do not. Using
     * that contextual distinction keeps a required address field billing-only.
     */
    public function requirementRule(): bool|array
    {
        if (get_option(self::SETTING_ID, 'no') !== 'yes') return false;

        return [
            'customer' => [
                'properties' => [
                    'address' => [
                        'required' => ['email'],
                    ],
                ],
            ],
        ];
    }

    /** @param array<int, array<string, mixed>> $settings */
    public function addRequirementSetting(array $settings): array
    {
        $setting = [
            'title'         => __('Tax ID', 'kizlo-woocommerce'),
            'desc'          => __('Require Tax ID at checkout', 'kizlo-woocommerce'),
            'desc_tip'      => __('Require a billing Tax ID when an order is confirmed or payment is retried.', 'kizlo-woocommerce'),
            'id'            => self::SETTING_ID,
            'default'       => 'no',
            'type'          => 'checkbox',
            'checkboxgroup' => '',
            'autoload'      => false,
        ];

        foreach ($settings as $index => $candidate) {
            if (($candidate['id'] ?? null) !== 'woocommerce_enable_checkout_login_reminder') continue;

            array_splice($settings, $index, 0, [$setting]);
            return $settings;
        }

        return $settings;
    }

    /** @param array<string, mixed> $fields */
    public function addCustomerBillingField(array $fields): array
    {
        if (! isset($fields['billing']['fields']) || ! is_array($fields['billing']['fields'])) return $fields;

        $fields['billing']['fields'][self::BILLING_META_KEY] = [
            'label'       => __('Tax ID', 'kizlo-woocommerce'),
            'description' => __('Billing tax identifier.', 'kizlo-woocommerce'),
        ];

        return $fields;
    }

    /** @param array<string, array<string, mixed>> $fields */
    public function addOrderBillingField(array $fields, mixed $order = null, string $context = 'edit'): array
    {
        if (! $order instanceof WC_Order) return $fields;

        $fields = $this->withoutTaxIdField($fields);
        $field  = [
            'id'              => self::BILLING_META_KEY,
            'label'           => __('Tax ID', 'kizlo-woocommerce'),
            'value'           => (string) $this->checkoutFields()->get_field_from_object(self::FIELD_ID, $order, 'billing'),
            'type'            => 'text',
            'update_callback' => [$this, 'updateOrderTaxId'],
            'show'            => true,
            'wrapper_class'   => 'form-field-wide',
        ];

        $keys     = array_keys($fields);
        $position = array_search('state', $keys, true);
        $offset   = $position === false ? count($fields) : $position + 1;

        return array_slice($fields, 0, $offset, true)
            + ['kizlo_tax_id' => $field]
            + array_slice($fields, $offset, null, true);
    }

    /** @param array<string, array<string, mixed>> $fields */
    public function removeOrderShippingField(array $fields, mixed $order = null, string $context = 'edit'): array
    {
        return $this->withoutTaxIdField($fields);
    }

    public function updateOrderTaxId(string $key, mixed $value, WC_Order $order): void
    {
        $this->checkoutFields()->persist_field_for_order(
            self::FIELD_ID,
            sanitize_text_field((string) $value),
            $order,
            'billing',
            false
        );
        $order->delete_meta_data(self::SHIPPING_META_KEY);
    }

    /** The cart route has already validated, sanitized and persisted the managed session value. */
    public function persistCartTaxId(WC_Customer $customer, WP_REST_Request $request): void
    {
        $billing = $request->get_param('billing_address');
        if (!is_array($billing) || !array_key_exists(self::FIELD_ID, $billing)) return;
        $customer->delete_meta_data(self::SHIPPING_META_KEY);
        $this->persistBillingProfile($customer);
    }

    /** A session-backed WC_Customer saves its metadata to the session, not the user's profile. */
    private function persistBillingProfile(WC_Customer $customer): void
    {
        if ($customer->get_id() === 0) return;
        $profile = new WC_Customer($customer->get_id());
        // The single-field getter substitutes configured defaults for an explicit empty value.
        $values = $this->checkoutFields()->get_all_fields_from_object($customer, 'billing');
        $value = $values[self::FIELD_ID] ?? '';
        $this->checkoutFields()->persist_field_for_customer(self::FIELD_ID, $value, $profile, 'billing');
        $profile->delete_meta_data(self::SHIPPING_META_KEY);
        // Save only metadata, so a cart edit does not invalidate its core-address session snapshot.
        $profile->save_meta_data();
    }

    public function validateRetryTaxId(mixed $response, mixed $handler, mixed $request): mixed
    {
        if (is_wp_error($response)) return $response;
        if (! $request instanceof WP_REST_Request) return $response;
        if ($request->get_method() !== 'POST') return $response;
        if (preg_match('#^/wc/store/v1/checkout/\d+$#', $request->get_route()) !== 1) return $response;
        if (get_option(self::SETTING_ID, 'no') !== 'yes') return $response;

        $billing = $request->get_param('billing_address');
        $taxId   = is_array($billing) ? ($billing[self::FIELD_ID] ?? null) : null;
        if (is_string($taxId) && trim($taxId) !== '') return $response;

        $message = __('Tax ID is required.', 'kizlo-woocommerce');

        return new WP_Error(
            'rest_invalid_param',
            __('Invalid parameter(s): billing_address', 'kizlo-woocommerce'),
            [
                'status'  => 400,
                'params'  => ['billing_address' => $message],
                'details' => [
                    'billing_address' => [
                        'code'    => 'woocommerce_required_checkout_field',
                        'message' => $message,
                        'data'    => ['param' => 'billing_address'],
                    ],
                ],
            ]
        );
    }

    public function persistRetryTaxId(WC_Order $order, WP_REST_Request $request): void
    {
        if (preg_match('#^/wc/store/v1/checkout/\d+$#', $request->get_route()) !== 1) return;

        $billing = $request->get_param('billing_address');
        if (! is_array($billing) || ! array_key_exists(self::FIELD_ID, $billing)) return;

        $value = sanitize_text_field((string) $billing[self::FIELD_ID]);
        $this->checkoutFields()->persist_field_for_order(self::FIELD_ID, $value, $order, 'billing', false);
        $order->delete_meta_data(self::SHIPPING_META_KEY);

        $customer = WC()->customer;
        $this->checkoutFields()->persist_field_for_customer(self::FIELD_ID, $value, $customer, 'billing');
        $customer->delete_meta_data(self::SHIPPING_META_KEY);
        $customer->save();
        $this->persistBillingProfile($customer);
    }

    public function removeStoreApiShippingCopies(mixed $response, mixed $server, mixed $request): mixed
    {
        if (! $response instanceof WP_HTTP_Response || $response->get_status() >= 400) return $response;
        if (! $request instanceof WP_REST_Request) return $response;
        if (preg_match('#^/wc/store/v1/(?:cart|checkout|order)(?:/|$)#', $request->get_route()) !== 1) return $response;

        $this->removeShippingCopy(WC()->customer);

        $data = $response->get_data();
        if (is_array($data)) {
            $orderId = absint($data['order_id'] ?? $data['id'] ?? 0);
            $order   = $orderId > 0 ? wc_get_order($orderId) : false;
            if ($order instanceof WC_Order) $this->removeShippingCopy($order);
        }

        return $response;
    }

    public function removeCustomerShippingCopy(int $userId): void
    {
        delete_user_meta($userId, self::SHIPPING_META_KEY);
    }

    /** @param array<string, array<string, mixed>> $fields */
    private function withoutTaxIdField(array $fields): array
    {
        foreach ($fields as $key => $field) {
            if ($key === self::FIELD_ID || ($field['id'] ?? null) === self::BILLING_META_KEY || ($field['id'] ?? null) === self::SHIPPING_META_KEY) {
                unset($fields[$key]);
            }
        }

        return $fields;
    }

    private function removeShippingCopy(WC_Customer|WC_Order $object): void
    {
        $value = $object->get_meta(self::SHIPPING_META_KEY, true);
        if ($value === '' || $value === null) return;

        $object->delete_meta_data(self::SHIPPING_META_KEY);
        $object->save();
    }

    private function checkoutFields(): CheckoutFields
    {
        return Package::container()->get(CheckoutFields::class);
    }
}
