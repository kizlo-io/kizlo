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

Requests to the plugin use HTTP Basic auth with a WordPress [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) belonging to an admin user. Generate one at **WP Admin → Users → Profile → Application Passwords** and treat it like a service credential — server-side only, kept in a secrets manager, rotatable.

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later — see the plugin header in [`kizlo.php`](kizlo.php).