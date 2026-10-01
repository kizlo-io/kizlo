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

Billing addresses expose `taxId` on customers, carts, checkout responses, and orders. The field is always a string on output and defaults to `""` when it has not been set. Billing address inputs accept an optional `taxId`; shipping addresses never expose or persist one.

```ts
await kizlo.woocommerce.cart.update.call({
  body: { billingAddress: { taxId: "GB123456789" } },
})
```

Store administrators can make the field mandatory from **WooCommerce → Settings → Accounts & Privacy → Checkout → Require Tax ID at checkout**. It remains optional by default.

## License

[Apache 2.0](./LICENSE) © Kizlo
