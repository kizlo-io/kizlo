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

Metadata and future error consumers use the exported resolver rather than a tax-ID key table:

```ts
import { resolveRegisteredFieldTarget } from "@kizlo/woocommerce"

const target = resolveRegisteredFieldTarget(store.address.fieldLocations, "kizlo/tax-id", "billing")
// path: ["billingAddress", "taxId"]
// wirePath: ["billing_address", "kizlo/tax-id"]
```

It retains registration location and value group, rejects unknown/ambiguous identities and address targets without a group, and returns no shipping tax-ID target under Kizlo's billing-only policy. Conditional rules still evaluate against the original Woo-shaped document. Error extraction and rule evaluation are separate consumers of this contract.

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
const postcode = { ...store.address.fields.postcode, ...country?.locale.postcode }
// { label: "Postal code", required: false, hidden: true, ... }
```

The response is cached in WordPress per locale. Changing a WooCommerce setting clears it and sends the `settings.woocommerce.updated` webhook event.

## License

[Apache 2.0](./LICENSE) © Kizlo
