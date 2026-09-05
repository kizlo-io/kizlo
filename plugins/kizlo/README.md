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

<h3 align="center">Kizlo</h3>

<p align="center">
  A plugin that connects your WordPress with the Kizlo framework, headlessly.
</p>

---

## Requirements

- WordPress 5.0+ (tested up to 6.4)
- PHP 8.2+

## Install

### From a release zip

1. Grab the latest `kizlo-vX.Y.Z.zip` from the project's release artifacts.
2. **WP Admin → Plugins → Add New → Upload Plugin → Activate.**

The plugin self-updates against `https://kizlo.io/plugin/updates/kizlo.json` (via [plugin-update-checker](https://github.com/YahnisElsts/plugin-update-checker)), so future versions appear in WP Admin like any other plugin update.

### From this monorepo (development)

See [Local WordPress stacks](../../CONTRIBUTING.md#local-wordpress-stacks) in `CONTRIBUTING.md` — `pnpm kizlo dev` bind-mounts this directory into your local WP install, so PHP edits show up live without a build or symlink step.

## Auth

Kizlo protects its own REST routes — everything under `/wp-json/kizlo/*` — with HTTP Basic auth using a WordPress [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) belonging to an administrator. Missing or invalid Application Password authentication returns `401`; a valid non-administrator Application Password returns `403`. A WordPress login cookie alone is not sufficient for these routes.

Native WordPress routes such as `/wp/v2/*`, and third-party plugin routes, keep their own authentication and capability checks. The block editor, the admin dashboard, and other plugins therefore work normally while Kizlo is active — they authenticate their own REST requests with a login cookie and nonce as they always have.

An integration may opt a sensitive route family back behind the administrator boundary. The WooCommerce integration does this for the entire Store API (`/wc/store/*` — cart, checkout, order, and product routes), because those routes act on an `X-Kizlo-User-Email` header that is trusted without cryptographic verification; WooCommerce's own admin and account routes (`/wc/v3/*`, `/wc-admin/*`) stay on their native permissions.

Generate an Application Password at **WP Admin → Users → Profile → Application Passwords** and treat it like a server-side, rotatable service credential.

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later; see the plugin header in [`kizlo.php`](kizlo.php).
