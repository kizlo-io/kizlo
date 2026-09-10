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

<h3 align="center">Kizlo WooCommerce</h3>

<p align="center">
Connects WooCommerce with the @kizlo/woocommerce integration.
</p>

---

## Requirements

- WordPress 6.5+ (tested up to 6.7)
- PHP 8.2+
- [Kizlo](../kizlo) core plugin, active
- [WooCommerce](https://wordpress.org/plugins/woocommerce/), active

WordPress 6.5+'s `Requires Plugins:` header enforces both dependencies. This companion plugin will not activate unless Kizlo core and WooCommerce are already active.

## Install

### From a release zip

1. Grab the latest `kizlo-woocommerce-vX.Y.Z.zip` from the project's release artifacts.
2. **WP Admin → Plugins → Add New → Upload Plugin → Activate.**

### From this monorepo (development)

See [Local WordPress stacks](../../CONTRIBUTING.md#local-wordpress-stacks) in `CONTRIBUTING.md`. `pnpm kizlo dev` bind-mounts this directory into your local WP install, so PHP edits show up live without a build or symlink step.

## Auth

The companion plugin uses Kizlo core's administrator Application Password guard for identity-sensitive routes. Missing or invalid Application Password authentication returns `401`; valid non-administrator credentials return `403`.

The protected families are `/wc/store/v1/cart`, `/wc/store/v1/checkout`, `/wc/store/v1/order`, `/wc/v3/customers`, and `/wc/v3/orders`, including their descendants. Other WooCommerce routes use their native permissions, so public Store API product and catalog requests remain anonymous and ignore Kizlo identity headers.

Cart and checkout requests carry identity headers (`X-Kizlo-User-Email` as the sole user identity, plus `X-Kizlo-Guest-Token`) that the headless session handler validates before selecting a cart. An email with no WordPress account resolves to a customer created on demand. When a user signs in with a guest cart, the plugin merges line items during that original request. It does not merge coupons, addresses, or shipping selections. Rejected guest lines are returned in the Store API cart's existing `errors` field.

Guest tokens, the signed Kizlo cookie, and WooCommerce's server session all expire after 48 hours. The cookie uses `Path=/`, `HttpOnly`, and `SameSite=Lax`. Cookie deletion is optional cleanup after a successful writable cart or checkout response; repeated requests remain safe when a Server Component cannot emit `Set-Cookie`.

## Embedding the order-pay page

Starting a payment returns a `redirectUrl` to WooCommerce's order-pay page, where the gateway loads. WooCommerce protects checkout responses with `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'`, so a headless storefront on a different origin cannot present that page inside a modal iframe.

When a Kizlo Site URL is configured, the order-pay response permits that one exact origin (scheme, host, and port) to frame it. No setting gates this; the configured Site URL is the trusted storefront. Every other response, including account pages, ordinary checkout, and unrelated WordPress routes, keeps WooCommerce's framing protection unchanged, and nothing changes at all when no Site URL is set.

Keep these in mind when framing the order-pay page:

- **Use HTTPS for the production Site URL.** A browser only honours a cross-origin frame ancestor over a secure context.
- **Verify payment completion server-side.** Framing the pay page does not change how payment state is confirmed. Read the order status through WooCommerce rather than trusting iframe navigation.
- **Keep a top-level fallback.** Some gateways, including bank 3-D Secure steps, refuse to run inside a nested frame. Open the pay URL in the full window when the frame is blocked.

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later. See the plugin header in [`kizlo-woocommerce.php`](kizlo-woocommerce.php).
