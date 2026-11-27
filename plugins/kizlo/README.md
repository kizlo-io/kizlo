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

- WordPress 6.9+
- PHP 8.2+

## Install

### From a release zip

1. Grab the latest `kizlo-vX.Y.Z.zip` from the project's release artifacts.
2. **WP Admin → Plugins → Add New → Upload Plugin → Activate.**

The plugin self-updates against `https://kizlo.io/plugin/updates/kizlo.json` (via [plugin-update-checker](https://github.com/YahnisElsts/plugin-update-checker)), so future versions appear in WP Admin like any other plugin update.

### From this monorepo (development)

See [Local WordPress stacks](../../CONTRIBUTING.md#local-wordpress-stacks) in `CONTRIBUTING.md` , `pnpm kizlo dev` bind-mounts this directory into your local WP install, so PHP edits show up live without a build or symlink step.

## Auth

Routes declare their access policy. Public content, site, menu and SEO reads are available directly to browsers. Administrative routes retain WordPress capability checks with native cookie+nonce or service Application Password authentication.

Configure Clerk, Kinde or Custom JWT under **System → Authentication**. WordPress verifies user tokens and permits only exact configured frontend origins. External tokens do not grant WordPress administrator capabilities. Keep Application Passwords private; see [authentication setup](https://kizlo.io/docs/concepts/authentication) and [direct clients](https://kizlo.io/docs/concepts/client).

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later; see the plugin header in [`kizlo.php`](kizlo.php).

## Webhook delivery

Content webhooks use native WP-Cron and private WordPress delivery records, with eight automatic attempts per target. Inspect `wp kizlo webhooks list`; use `wp kizlo webhooks retry <delivery-id>` after repairing a failed destination. Keep a real cron or WP-CLI runner on low-traffic sites. See [delivery and recovery](https://kizlo.io/docs/php/functions/emit-event#delivery-and-recovery) for acknowledgement, duplicate handling and recovery limits.
