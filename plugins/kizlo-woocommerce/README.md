<p align="center">
  <img src="../../.github/assets/kizlo.svg" alt="Kizlo" width="120" />
</p>

<h1 align="center">Kizlo WooCommerce</h1>

Bring your WooCommerce store into any JavaScript runtime. Build storefronts, product pages, and checkout flows with modern tools and AI coding assistants.

## Requirements

- WordPress 6.5+ (tested up to 6.7)
- PHP 8.2+
- [Kizlo](../kizlo) core plugin, active
- [WooCommerce](https://wordpress.org/plugins/woocommerce/), active

WordPress 6.5+'s `Requires Plugins:` header enforces both dependencies — this extension will not activate unless Kizlo core and WooCommerce are already active.

## Install

### From a release zip

1. Grab the latest `kizlo-woocommerce-vX.Y.Z.zip` from the project's release artifacts.
2. **WP Admin → Plugins → Add New → Upload Plugin → Activate.**

### From this monorepo (development)

See [Local WordPress stacks](../../CONTRIBUTING.md#local-wordpress-stacks) in `CONTRIBUTING.md` — `pnpm kizlo dev` bind-mounts this directory into your local WP install, so PHP edits show up live without a build or symlink step.

## Auth

This extension's REST endpoints are gated by the same Application Password auth as Kizlo core. See [Kizlo core's auth section](../kizlo/README.md#auth) for setup.

Cart and Store API requests additionally carry identity headers (`X-Kizlo-User-Id`, `X-Kizlo-Guest-Token`, …) that the headless session handler uses to resolve the cart owner without cookies.

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later — see the plugin header in [`kizlo-woocommerce.php`](kizlo-woocommerce.php).
