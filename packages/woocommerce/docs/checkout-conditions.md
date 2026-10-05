# Data for checkout field conditions

Use this contract to build WooCommerce field conditions from the SDK's existing resources. [KIT-23](https://linear.app/kizlo/issue/KIT-23) owns the optional `useCheckoutFields({ values })` hook, document construction, diagnostics, and whole-form validation. This SDK supplies the producer data; server checkout validation remains authoritative.

## Collection classification

`Storefront.checkout.localPickup.methodIds` contains Woo-derived shipping method IDs supporting local pickup, including plugin methods. It describes store configuration independently of `localPickup.enabled`. The plugin publishes `checkout.local_pickup.method_ids` through the existing storefront endpoint and caches no shopper state.

| SDK value | Meaning |
| --- | --- |
| `string[]` | Known classification; preserve method IDs literally. |
| `[]` | Known empty classification. |
| `null` | Older producer, explicit null, or malformed list; collection-dependent rules need an unavailable-data diagnostic. |

Deploy the matching plugin and regenerate your WordPress contract to describe the new wire property. Older contracts/responses remain readable; the mapper supplies `null` when classification is unavailable. Settings changes and plugin activation/deactivation invalidate the storefront cache, and the cache revision prevents serving a payload from before this addition.

## Document property sources

Read the latest acknowledged cart and loaded checkout identity through Kit's shared query layer. Use field definitions and bindings from storefront settings. Once an application supplies its complete current checkout form snapshot, all editable values come from that snapshot, including empty strings, `false`, and omitted optional values; do not merge saved values back over current edits.

| Woo document property | SDK source and normalization |
| --- | --- |
| `cart.coupons` | `Cart.coupons.map(coupon => coupon.code)`. |
| `cart.shipping_rates` | First selected rate's `id` per `shippingPackages` entry; drop absent selections and deduplicate into a dense array. |
| `cart.items` | Repeat each `item.variationId ?? item.productId` by `Math.ceil(item.quantity)` in line order. |
| `cart.items_type` | Distinct `Cart.items[].type`, in first-seen order, as a dense array. |
| `cart.items_count` | `Cart.itemCount`, preserving fractional counts. |
| `cart.items_weight` | `Cart.itemsWeight`, preserving the API value without rounding or unit conversion. |
| `cart.needs_shipping` | `Cart.needsShipping`. |
| `cart.prefers_collection` | Any first selected rate per package whose `methodId` is in `localPickup.methodIds`; no selected rates means `false` when classification is known. Missing classification remains unavailable. |
| `cart.totals.total_price` | `Cart.totals.total`, already a numeric minor-unit amount. |
| `cart.totals.total_tax` | `Cart.totals.taxTotal`, already a numeric minor-unit amount. |
| `cart.extensions` | `Cart.extensions`, retaining third-party namespace keys and payloads unchanged. |
| `customer.id` | Loaded `Checkout.customerId`; a loaded `null` means known guest ID `0`. An unloaded checkout is not a guest. |
| `customer.billing_address` | Current `values.billingAddress`, restored to Woo names through address bindings. |
| `customer.shipping_address` | Current `values.shippingAddress`, restored through address bindings. Missing initialization data stays distinguishable from a known empty group. |
| `customer.address` | Billing or shipping address alias for that field's evaluation only; absent from the global/contact/order document. |
| `customer.additional_fields` | Current `values.additionalFields` entries whose definitions have `location: "contact"`. Core email remains in the billing address. |
| `checkout.additional_fields` | Current `values.additionalFields` entries whose definitions have `location: "order"`. |
| `checkout.payment_method` | Current `values.paymentMethod`. |
| `checkout.customer_note` | Current `values.customerNote`. |
| `checkout.create_account` | Current `values.createAccount`, following confirmation's omitted-value default of `false`. |

With `values` absent, derive rendering/default values from a coherent loaded checkout and cart snapshot. Checkout provides loaded addresses, additional fields, payment method, and customer note; it does not supply a saved account-creation choice. Candidate validation rebuilds editable document values from the full candidate and the latest acknowledged sources.

## Preserve field and extension identity

Restore only known structural keys: for example `firstName` to `first_name` and `address1` to `address_1`. Address extras flatten `additionalFields[id]` to the literal Woo field ID. Native billing `taxId` becomes `kizlo/tax-id`; the managed field has no shipping binding. For contact/order extras, use definition locations and `bindings.other`. Treat slash, dot, and bracket characters inside an ID as part of one key, not as path separators.

Do not recursively snake-case plugin IDs or extension payloads. The SDK extracts the reserved `extensions.kizlo` namespace into native properties; conditions depending on unavailable reserved data need diagnostics. Do not reconstruct that namespace from partial projections. Checkout extensions are not substituted for cart extensions, and item extensions are not merged into `cart.extensions`.

## Freshness and Woo comparison

Pending rate/address mutations retain the last acknowledged cart facts and expose pending/repricing state. An unsaved pickup UI choice cannot set `prefers_collection`. The hook never selects a rate, saves edits, resets values, or submits checkout as a side effect of evaluating a condition.

The comparison baseline is WooCommerce **11.0.1**, pinned by this repository's seeded stack:

- [Browser document builder](https://github.com/woocommerce/woocommerce/blob/11.0.1/plugins/woocommerce/client/blocks/assets/js/base/hooks/use-schema-parser.ts): uses dense distinct type/rate arrays and JavaScript quantity ceiling. Its recursive key conversion is not applied to opaque plugin data here.
- [PHP DocumentObject](https://github.com/woocommerce/woocommerce/blob/11.0.1/plugins/woocommerce/src/Blocks/Domain/Services/CheckoutFieldsSchema/DocumentObject.php): uses an intersection with selected method IDs for collection. `array_unique` can serialize repeated item types as a sparse numeric-keyed object, and selected rate IDs need not be distinct. The client keeps dense distinct arrays instead.
- [PHP NumberUtil](https://github.com/woocommerce/woocommerce/blob/11.0.1/plugins/woocommerce/src/Utilities/NumberUtil.php): normalizes floating-point noise before ceiling quantities; JavaScript uses `Math.ceil` directly. Neither mapping rounds cart counts/weight.
- [Browser shipping helpers](https://github.com/woocommerce/woocommerce/blob/11.0.1/plugins/woocommerce/client/blocks/assets/js/base/utils/shipping-rates.ts): require all selected rates to be collectable for their UI predicate. This contract follows PHP's any-selected-method intersection across packages for server validation compatibility.
- [CheckoutTrait](https://github.com/woocommerce/woocommerce/blob/11.0.1/plugins/woocommerce/src/StoreApi/Utilities/CheckoutTrait.php): partitions current additional fields into contact/order and builds editable checkout data from the request. No byte-for-byte PHP serialization parity is promised.

## Seeded evidence for Kit

The additional-fields fixture registers `qa/pickup-reference`, required when pickup is selected and `cart.extensions.qaConditions["reference.required"]` is true. It provides custom method `qa_pickup` and rate `qa_pickup:fixture`. The SDK integration test submits through native checkout, checks the saved order, and verifies the field binding and native error parameter. Woo reports this requiredness failure at `additional_fields`, which targets the form's `additionalFields` group; the server error does not identify a leaf. Keep that group error distinct from a client validator's known field path `["additionalFields", "qa/pickup-reference"]`.

Use [the static handoff fixture](../src/test/fixtures/checkout-conditions.json) in Kit's service-free model tests. Run the upstream evidence through `pnpm test:only @kizlo/woocommerce` against the seeded stack; Kit starts no WordPress services. This contract does not add a public builder or document snapshot.
