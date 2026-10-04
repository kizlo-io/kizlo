<br>

<p align="center">
  <a name="readme-top"></a>
  <a href="https://kizlo.io">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://cdn.kizlo.io/logo/icon-light.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://cdn.kizlo.io/logo/icon-dark.svg">
      <img alt="Kizlo" src="https://cdn.kizlo.io/logo/icon-dark.svg" height="100">
    </picture>
  </a>
</p>

<h3 align="center">WooCommerce Integration</h3>

<p align="center">
  Type-safe storefront using the WooCommerce WordPress plugin
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kizlo/woocommerce"><img src="https://img.shields.io/npm/v/@kizlo/woocommerce?style=flat-square&color=333" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/kizlo-io/kizlo?style=flat-square&color=333" alt="License"></a>
  <a href="https://www.npmjs.com/package/@kizlo/woocommerce"><img src="https://img.shields.io/npm/dt/@kizlo/woocommerce?style=flat-square&color=333" alt="npm downloads"></a>
</p>

<p align="center">
  <a href="https://kizlo.io"><strong>Website</strong></a> ·
  <a href="https://kizlo.io/docs"><strong>Docs</strong></a> ·
  <a href="https://discord.com/invite/MjAUZamx5g"><strong>Discord</strong></a> ·
  <a href="https://x.com/kizlo_io"><strong>Twitter</strong></a>
</p>

---

## Install

```bash
pnpm add @kizlo/woocommerce
```

## Documentation

See the [docs](https://kizlo.io/docs) for setup and usage.

## Billing Tax IDs

Billing addresses expose `taxId` on customers, carts, checkout responses, and orders. The field is always a string on output and defaults to `""` when it has not been set. Billing address inputs accept an optional `taxId`; shipping addresses have no native `taxId`, and Kizlo discards managed shipping copies independently of the hidden UI rule.

```ts
await kizlo.woocommerce.cart.update.call({
  body: { billingAddress: { taxId: "GB123456789" } },
})
```

Store administrators can make the field mandatory from **WooCommerce → Settings → Accounts & Privacy → Checkout → Require Tax ID at checkout**. It remains optional by default.

The native value maps to the official registered `kizlo/tax-id` address field. For example, `{ billingAddress: { taxId: "GB123" } }` becomes `{ billing_address: { "kizlo/tax-id": "GB123" } }` on the Store API wire. Partial cart/customer-address updates omit the key when `taxId` is omitted; `taxId: ""` clears it. Full confirmation/retry inputs retain the existing empty-string default. WooCommerce owns sanitization and contextual requiredness.

Raw introspection preserves `kizlo/tax-id` in both address schemas. Normalized billing `additionalFields` omits it from types and values: use the native property. Raw billing inputs using that key are rejected even when a duplicate equals `taxId`; there is no raw-only compatibility alias. Other registered and compatible unknown response extras retain their usual buckets.

Customer reads use the grouped `billing.additional_fields` adapter backed by public CheckoutFields helpers. Orders read their own snapshot, never the current profile. Storage remains `_wc_billing/kizlo/tax-id`, so existing saved values need no migration. Order admin edits set/replace/clear the order alone; profile edits affect later cart hydration. The retry validation/persistence bridge and shipping cleanup remain required on WooCommerce 11.0.1.

Consumers should deploy the matching WooCommerce plugin and regenerate their contract after upgrading; the old per-field raw `billing.tax_id` response is removed. The native API remains `customer.billing.taxId` and `billingAddress.taxId`. This feature does not validate jurisdiction-specific identifiers or calculate tax exemptions.

Storefront field definitions include SDK binding paths derived from the same address identity and native projection contract. For billing Tax ID, `bindings.billing` is `["taxId"]`; there is no shipping binding. Registered-field error targeting remains a separate SDK helper.

## Storefront settings

`storefront.get` returns the store-wide settings a storefront renders with, so nothing has to be hardcoded:

- `address`: the countries the store sells and ships to, their states, the per-country field rules, and every checkout field including ones plugins register
- `checkout`: guest checkout, coupons, tax display, shipping and local pickup
- `pricing`: the currency format, plus how prices show tax
- `catalog`: units, review rules and stock display

A field's rules for a country are its default merged with that country's override, the way WooCommerce's Checkout block builds them:

```ts
const store = await kizlo.woocommerce.storefront.get.call()

const country = store.address.countries.find((entry) => entry.code === "AE")
const postcode = { ...store.address.fields.find((field) => field.id === "postcode"), ...country?.locale.postcode }
// { label: "Postal code", required: false, hidden: true, ... }
```

`address.fields` is an array containing every core and registered address/contact/order definition. Each entry carries its original Woo `id`, `location`, labels, control `type`, `options`, `attributes`, boolean/JSON Schema `required` and `hidden`, and a value `schema` expressed as draft-07 JSON Schema. Woo shorthand conditions are wrapped into standard `properties`. Declarative validation and supported HTML constraints survive; PHP callbacks stay on the server.

```ts
// Example normalized definition; no shopper values are included.
{
  id: "first_name", location: "address", label: "First name",
  required: true, hidden: false, type: null,
  attributes: { autocomplete: "given-name" }, schema: { type: "string" },
  bindings: { billing: ["firstName"], shipping: ["firstName"] },
  // optionalLabel, index, placeholder, options, autocomplete also accompany it.
}
```

Address `bindings.billing` and `bindings.shipping` are relative to the address object. Contact/order `bindings.other` follow Checkout: email uses `["billingAddress", "email"]`, extras use `["additionalFields", id]`. Address extras use `["additionalFields", id]`; the complete ID is one literal segment, even if it contains dots or brackets. No separate `fieldLocations` is needed. Kizlo API values and write serialization remain unchanged.

Upgrade the matching plugin and SDK together and regenerate the consumer contract. The field-map/location-list response is replaced by the field array. Kit's group resolvers transform these definitions into form metadata and complete validation schemas; applications decide where and how to render them. Cart-dependent plugin rules remain a separate integration concern; this response does not contain a field document or shopper/session data.

The response is cached in WordPress per locale. Changing a WooCommerce setting clears it and sends the `settings.woocommerce.updated` webhook event.

## License

[Apache 2.0](./LICENSE) © Kizlo
