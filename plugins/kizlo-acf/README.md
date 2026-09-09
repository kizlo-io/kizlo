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

<h3 align="center">Kizlo ACF</h3>

<p align="center">
Publishes Advanced Custom Fields values under <code>kizlo.custom.acf</code>.
</p>

---

## What it does

Advanced Custom Fields attaches field groups to WordPress objects, but Kizlo's contract does not describe them on its own. With this plugin active, every managed post type and taxonomy that has ACF field groups gains a typed `acf` object under `kizlo.custom`:

- It is described in `/introspect`, one typed property per ACF field.
- A GET on the object returns `kizlo.custom.acf` values in that shape.
- The developer-facing wrapped object exposes them at `post.custom.acf.*` with no client change.

An object with no ACF field groups gets no `acf` entry, so the description and the payload always agree.

> **`acf` is a reserved key.** `custom` is the shared bag for both your configured Kizlo fields and integration namespaces like this one. A Kizlo custom field literally named `acf` would collide with this block, so pick another name for it.

Read/introspection only — ACF values are not accepted on create or update. Managed post types and taxonomies are covered; users, options pages, comments, and menus are not.

## Requirements

- WordPress 6.5+ (tested up to 6.7)
- PHP 8.2+
- [Kizlo](../kizlo) core plugin 0.16.0+, active
- [Advanced Custom Fields](https://wordpress.org/plugins/advanced-custom-fields/), active

WordPress 6.5+'s `Requires Plugins:` header enforces both dependencies. This companion plugin will not activate unless Kizlo core and Advanced Custom Fields are already active.

## Install

### From a release zip

1. Grab the latest `kizlo-acf-vX.Y.Z.zip` from the project's release artifacts.
2. **WP Admin → Plugins → Add New → Upload Plugin → Activate.**

### From this monorepo (development)

See [Local WordPress stacks](../../CONTRIBUTING.md#local-wordpress-stacks) in `CONTRIBUTING.md`. `pnpm kizlo dev` bind-mounts this directory into your local WP install, so PHP edits show up live without a build or symlink step.

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later. See the plugin header in [`kizlo-acf.php`](kizlo-acf.php).
