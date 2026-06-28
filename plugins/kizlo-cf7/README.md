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

<h3 align="center">Kizlo Contact Form 7</h3>

<p align="center">
Connects contact form 7 plugin with @kizlo/cf7 extension.
</p>

---

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

See [Local WordPress stacks](../../CONTRIBUTING.md#local-wordpress-stacks) in `CONTRIBUTING.md` — `pnpm kizlo dev` bind-mounts this directory into your local WP install, so PHP edits show up live without a build or symlink step.

## Auth

This extension's REST endpoints are gated by the same Application Password auth as Kizlo core. See [Kizlo core's auth section](../kizlo/README.md#auth) for setup.

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later — see the plugin header in [`kizlo-cf7.php`](kizlo-cf7.php).
