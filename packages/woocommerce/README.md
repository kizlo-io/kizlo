# @kizlo/woocommerce

WooCommerce extension for [Kizlo](https://github.com/kizlo-io/kizlo).

Adds typed `cart`, `checkout`, `products`, and `customers` routes — backed by
the WooCommerce Store API (`/wc/store/v1/*`) and admin REST API (`/wc/v3/*`) —
to your Kizlo server.

## Install

```bash
pnpm add @kizlo/woocommerce
```

> Requires the [`kizlo`](https://www.npmjs.com/package/kizlo) core package and a
> WordPress install running the WooCommerce plugin.

## Usage

```ts
import { Kizlo } from "kizlo"
import { woocommerce } from "@kizlo/woocommerce"

const kizlo = new Kizlo({
  // ...core config
  extensions: [woocommerce()],
})

const products = await kizlo.client.woocommerce.products.list()
const cart = await kizlo.client.woocommerce.cart.get()
```

## Routes

| Route | Description |
| --- | --- |
| `cart` | Read and mutate the customer cart. |
| `checkout` | Process checkout / place orders. |
| `products` | Browse and query products. |
| `customers` | Manage customer accounts. |

## License

[MIT](../../LICENSE) © Kizlo
