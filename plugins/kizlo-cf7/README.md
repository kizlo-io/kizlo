<p align="center">
  <img src="../../.github/assets/kizlo.svg" alt="Kizlo" width="120" />
</p>

<h1 align="center">Kizlo Contact Form 7</h1>

Bring your Contact Form 7 forms into any JavaScript runtime. Submit and validate forms from AI-built UIs without touching the CF7 page markup.

## Requirements

- WordPress 6.5+ (tested up to 6.7)
- PHP 8.2+
- [Kizlo](../kizlo) core plugin, active
- [Contact Form 7](https://wordpress.org/plugins/contact-form-7/), active

WordPress 6.5+'s `Requires Plugins:` header enforces both dependencies — this extension will not activate unless Kizlo core and Contact Form 7 are already active.

## Install

### From a release zip

1. Grab the latest `kizlo-cf7-vX.Y.Z.zip` from the project's release artifacts.
2. **WP Admin → Plugins → Add New → Upload Plugin → Activate.**

### From this monorepo (development)

See the [Link plugins into WordPress](../../CONTRIBUTING.md#link-plugins-into-wordpress) step in `CONTRIBUTING.md` — `pnpm install` will symlink this directory into your local WP install once `KIZLO_WP_PLUGINS_DIR` is set.

## Auth

This extension's REST endpoints are gated by the same Application Password auth as Kizlo core. See [Kizlo core's auth section](../kizlo/README.md#auth) for setup.

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later — see the plugin header in [`kizlo-cf7.php`](kizlo-cf7.php).
