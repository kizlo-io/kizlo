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

Kizlo's REST routes under `/wp-json/kizlo/*` require administrator access. External clients use HTTP Basic auth with a WordPress [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/); browser admin screens use a WordPress login cookie and REST nonce. Missing or invalid authentication returns `401`, and authenticated non-administrators receive `403`.

Native WordPress routes such as `/wp/v2/*`, and third-party plugin routes, keep their own authentication and capability checks. The block editor, the admin dashboard, and other plugins therefore work normally while Kizlo is active , they authenticate their own REST requests with a login cookie and nonce as they always have.

An integration may opt a sensitive route family back behind the administrator boundary. The WooCommerce integration does this for the entire Store API (`/wc/store/*` , cart, checkout, order, and product routes), because those routes act on an `X-Kizlo-User-Email` header that is trusted without cryptographic verification; WooCommerce's own admin and account routes (`/wc/v3/*`, `/wc-admin/*`) stay on their native permissions.

Generate an Application Password at **WP Admin → Users → Profile → Application Passwords** and treat it like a server-side, rotatable service credential.

## WhatsApp integration

Open **Kizlo → Integrations → WhatsApp** as an administrator. Save your Meta phone
number ID and API token, then use **Send test message** with a verified recipient.
The test recipient number is remembered in this browser; clear the field to forget it.
The token field shows dots when a token exists. Leave it blank to preserve the
saved token, or enter a replacement. Tokens are encrypted with the site's
authentication salt, omitted from API responses and browser bootstrap, and must
be re-entered after salt rotation.

Use the shared PHP client from another plugin:

```php
$whatsapp = kizlo_get_integrations()->whatsapp;
$result = $whatsapp->sendText('+919876543210', 'Your payment link: https://example.org/pay');

if (is_wp_error($result)) {
    // Show the error to the operator. Reconcile unknown delivery before retrying.
}
```

- `sendText($to, $text)` sends text within an open customer-service window.
- `sendDocument($to, $source, $filename, $caption)` sends a Meta media ID or public HTTPS document URL. Invoice generation is separate.
- `sendTemplate($to, $name, $language, $components)` sends an approved template. The default language is `en_US`.
- Accessing `kizlo_get_integrations()` makes no provider request. Clients read the current site's saved connection when sending.
- Successful sends return `['status' => 'accepted', 'provider_id' => '...']`. This confirms API acceptance, not delivery or payment. Delivery/read webhooks are not included; uncertain outcomes are not automatically retried.

The administrator-only REST API exposes `POST /wp-json/kizlo/v1/whatsapp/send`
with `to`, `type` (`text`, `document`, or `template`), and the corresponding fields.
These operations are discoverable through Kizlo introspection. Connection settings
use `GET`/`PUT /wp-json/kizlo/v1/settings/integrations/whatsapp`; `api_token` is
write-only, and `clear_token: true` removes it. Browser/admin clients use normal
WordPress authentication; external clients use an administrator Application Password.

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later; see the plugin header in [`kizlo.php`](kizlo.php).

## Webhook delivery

Content webhooks use native WP-Cron and private WordPress delivery records, with eight automatic attempts per target. Inspect `wp kizlo webhooks list`; use `wp kizlo webhooks retry <delivery-id>` after repairing a failed destination. Keep a real cron or WP-CLI runner on low-traffic sites. See [delivery and recovery](https://kizlo.io/docs/php/functions/emit-event#delivery-and-recovery) for acknowledgement, duplicate handling and recovery limits.
