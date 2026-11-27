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

## Call WordPress directly

Install the matching Kizlo WooCommerce plugin, configure authentication in WordPress, and run `kizlo generate`. Browser calls use the generated public projection and native Store API inputs:

```ts
import { createBrowserClient } from "kizlo/browser"
import { requireData } from "kizlo"
import { deserializeCart } from "@kizlo/woocommerce"
import { introspection } from "./generated/introspection.browser"

const client = createBrowserClient({
  url: "https://cms.example.com",
  endpoints: introspection,
})

const cart = deserializeCart(requireData(await client.woocommerce.store.cart.retrieve()))
```

For cart writes, supply a `cartSession` store to retain the signed `Cart-Token` returned by WooCommerce. For signed-in requests, supply `getToken`. See [direct clients](https://kizlo.io/docs/concepts/client) and [authentication](https://kizlo.io/docs/concepts/authentication).

## Present commerce data

This package exports pure schemas, serializers, and formatters such as `deserializeCart`, `deserializeCheckout`, `deserializeCustomer`, `deserializeOrder`, and `deserializeStorefront`. They convert native payloads into presentation models; call them explicitly after a successful response. The `woocommerce()` integration factory and application procedures are removed.

Direct requests use native names such as `billing_address`, `payment_method`, `additional_fields`, and `expected_total`. Checkout uses `client.woocommerce.store.checkout.create(...)`; read the current cart separately. Failures preserve native WordPress/WooCommerce codes, status, and evidence through `{ data, error, status, headers }`.

## Authenticate shoppers

WordPress verifies the user token and lazily finds or creates a customer by verified email. Missing or unverified email remains a guest identity and cannot acquire an existing customer. Customer and order-history endpoints enforce ownership in WordPress; service credentials do not select a shopper.

WooCommerce's guest-checkout setting controls anonymous checkout. Replace the former `allowGuest` application option with backend policy. Existing frontend guest cookies cannot establish a signed Store API session; see the [v1 migration](https://kizlo.io/docs/concepts/migration-v1) before cutover.

## Submit checkout fields

Send native checkout fields, including `expected_total` when protecting a shopper-reviewed amount. WooCommerce validates addresses, registered fields, payment, and the current total. Handle a 409 conflict by asking the shopper to review the returned evidence before resubmitting.

Billing Tax ID uses the registered `kizlo/tax-id` address key on the wire. The pure address serializers expose `taxId` and preserve omission versus an explicit empty value. Shipping has no Tax ID. See [additional checkout fields](https://kizlo.io/docs/concepts/additional-checkout-fields) for registered inputs and [validation bindings](./docs/checkout-validation.md) for presentation models.

## Read storefront settings

`client.woocommerce.kizlo.storefront.retrieve()` returns public store settings and field definitions. Pass its result through `deserializeStorefront` for the presentation model, including address rules, currency formatting, guest-checkout policy, and local-pickup method metadata.

See [checkout condition data](./docs/checkout-conditions.md) for field-document mapping. WordPress caches these public settings per locale and invalidates them when store settings or plugins change.

## License

[Apache 2.0](./LICENSE) © Kizlo
