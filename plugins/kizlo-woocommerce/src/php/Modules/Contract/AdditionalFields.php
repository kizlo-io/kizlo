<?php

namespace Kizlo\WooCommerce\Modules\Contract;

use Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields;
use Automattic\WooCommerce\Blocks\Package;
use Automattic\WooCommerce\StoreApi\SchemaController;
use Automattic\WooCommerce\StoreApi\StoreApi;
use WC_Customer;
use WC_Data;

/** Registered identities from CheckoutFields, value definitions from public Store API schemas. */
final class AdditionalFields
{
    public const PREFIX = 'woocommerce.additional-fields.';
    public const LOCATIONS = ['address', 'contact', 'order', 'checkout'];

    public static function registerSchemas(): void
    {
        foreach (self::LOCATIONS as $location) {
            foreach (['read', 'write'] as $operation) {
                kizlo_register_route_schema(self::id($location, $operation), static fn(): array => self::schema($location, $operation));
            }
        }
    }

    public static function id(string $location, string $operation = 'read'): string
    {
        return self::PREFIX . $location . '.' . $operation;
    }

    public static function registry(): CheckoutFields
    {
        return Package::container()->get(CheckoutFields::class);
    }

    /** @return array<string, mixed> */
    public static function schema(string $location, string $operation = 'read'): array
    {
        $controller = StoreApi::container()->get(SchemaController::class);
        $source = $location === 'address'
            ? $controller->get('billing-address')->get_properties()
            : $controller->get('checkout')->get_properties()['additional_fields']['properties'];
        $registry = self::registry();
        $fields = $location === 'checkout'
            ? array_merge($registry->get_fields_for_location('contact'), $registry->get_fields_for_location('order'))
            : $registry->get_fields_for_location($location);
        $properties = kizlo_translate_spec_properties(
            array_intersect_key($source, $fields),
            self::id($location, $operation),
            context: $operation === 'read' ? 'view' : 'edit',
        );
        // A registration requirement governs submission, not presence in saved metadata.
        // Contextual visibility never removes the registered identity from either address.
        if ($operation === 'read') {
            foreach ($properties as &$property) $property['required'] = false;
            unset($property);
        }
        ksort($properties);

        return [
            'type' => 'object',
            'description' => sprintf('Registered %s additional fields for %s operations.', $location, $operation),
            'properties' => $properties,
            'additionalProperties' => false,
        ];
    }

    /** Read only registered fields in the requested persistence group; never leak order fields into customers. */
    public static function values(WC_Data $object, string $group): array
    {
        $registry = self::registry();
        $registered = $group === 'other'
            ? array_merge($registry->get_fields_for_location('contact'), $registry->get_fields_for_location('order'))
            : $registry->get_fields_for_location('address');
        $values = $registry->get_all_fields_from_object($object, $group);
        $result = [];
        foreach ($values as $key => $value) {
            if (!isset($registered[$key])) continue;
            if ($object instanceof WC_Customer && !$registry->is_customer_field($key)) continue;
            $result[$key] = $registered[$key]['type'] === 'checkbox' ? (bool) $value : (string) $value;
        }
        return $result;
    }
}
