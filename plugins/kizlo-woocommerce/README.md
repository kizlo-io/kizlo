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

## Product HS codes

Set a product's Harmonized System code under **Product data → Shipping → HS code**. The value is exposed as `Product.hsCode`; variable-product order lines inherit it from their parent product.

When an order line is created, the plugin stores the HS code on that line. `OrderItem.hsCode` therefore keeps the value used at order time even if the product is later edited or deleted. Orders created before this field was available return `null` instead of using the product's current value.

## Barcode assignment and labels

Use the existing **GTIN, UPC, EAN, or ISBN** field in each product or variation's inventory controls for its one active barcode value. Enter an existing barcode there, or choose a type, check **Generate barcode**, and save to fill an empty field. SKU stays independent. Configure supported formats and A4/thermal print defaults under **WooCommerce → Settings → Products → Barcodes**; changing the default never rewrites existing assignments.

You can save a product's barcode type before generating its number. Generation uses an explicit selection first, then the saved type, then the store default. If the barcode changes while an editor is open, saving that editor keeps the current barcode and asks you to reload; unrelated edits still save. Conflicting UPC-A/EAN-13 equivalents are rejected without replacing the previous value.

1. Select **Generate barcodes** from Products bulk actions. The confirmation modal shows how many selected products and variations will get a barcode and how many already have one. Confirm to fill missing values on the same page; existing numbers and types stay unchanged.
2. Select **Regenerate barcodes** to deliberately replace existing numbers, including manufacturer identifiers. Confirm the warning in the modal on the current page. Printed labels need replacing after regeneration. Cancel makes no changes. Previous values are not active aliases; update integrations that use them.
3. Select **Print barcode labels** from the selected products' bulk actions, or open a product's **Print labels** action. The print format selector and actions share a wrapping row above the selected-items table; dimensions, margins and gaps use the saved barcode settings. Choose each item's count (zero omits it), then select **Preview** to open the A4 or thermal layout and its label/page summary in a scrollable modal. Batches allow 200 sellable items and 2,000 labels. Defaults are 50 × 30 mm labels, 10 mm A4 margins and 2 mm gaps. Wider formats such as Code 39 can require larger labels.
4. Print at actual size / 100%, disable browser headers and footers, and match the printer paper size. Check a test sheet first. Each label includes the item name, symbol and readable value. Invalid check digits, incompatible types and layouts too small for readable bars or quiet zones are rejected.

### Identifier stability and API access

New numbers use a store-local sequence and check digit: EAN-13 uses prefix `04` plus ten padded sequence digits, UPC-A uses `4` plus ten digits, and EAN-8 uses `2` plus six digits. Code 128 and Code 39 encode the same numeric form as EAN-13. These are store-scoped restricted-circulation identifiers, not globally allocated GTINs. Exhausted formats fail without truncation. Regeneration assigns a different number; repeated or stale submissions cannot replace it again without a fresh confirmation.

Authenticated WooCommerce REST v3 product and variation responses expose the active value in `global_unique_id`, with `_kizlo_barcode_type` in `meta_data` for the rendering enum (`ean13`, `upc_a`, `ean8`, `code128`, or `code39`). Barcode values preserve leading zeroes, remain stable across routine saves and reprints, and are cleared when products or variations are duplicated. Existing eight-digit values require an explicit printing type because length alone cannot distinguish EAN-8 from UPC-E. A draft installation using `_kizlo_barcode` must migrate compatible values unchanged to the native field before assignment; values that native validation would alter must be reviewed rather than silently stripped.

Preview and printing do not assign identifiers or change inventory. The five print formats have scanner fixtures; physical A4/thermal prints still need iPhone and Android acceptance checks. Mobile POS, UPC-E/Code 93 printing and external lookup are outside this feature.

## Auth

Storefront, cart and checkout calls go directly to WordPress. A fresh provider Bearer token identifies a user; only a verified email may find or lazily create a customer. Unverified users retain permitted guest shopping. Administrator credentials do not impersonate a customer. Native WooCommerce administrative routes retain their own capability checks.

Start a guest cart with `GET /wc/store/v1/cart`, then return its signed `Cart-Token` on subsequent requests. Customer cart tokens require the matching verified identity. Unsigned user-email and guest-ID headers are rejected. The store's guest-checkout policy still applies; sign up through your auth provider rather than creating a WordPress account at checkout.

### Session lifecycle

When a verified user presents a guest cart, line items merge into that customer's saved cart exactly once. Merges into one customer are serialized; coupons, addresses and shipping selections are not merged. Rejected lines remain visible in the Store API cart's `errors` field.

Clear client cart storage on logout and account switches. WordPress checks token ownership on every request. Existing frontend-owned guest cookies cannot establish the new signed session; see [v1 migration](https://kizlo.io/docs/concepts/migration-v1).

## Redirecting after checkout

When a Kizlo Site URL is configured, the plugin sends the shopper back to the headless storefront once checkout finishes. There is no admin setting: the storefront chooses each destination per checkout by sending relative `extensions.kizlo.success_path` and `extensions.kizlo.cancel_path` when it confirms or retries checkout, and the plugin stamps them on the order.

- **Success.** After payment completes, the order-received redirect resolves `success_path` against the Site URL and appends `order_id` and `key`. Without a `success_path` it falls back to `/checkout/order-received`.
- **Cancel.** Aborting an off-site payment still runs WooCommerce's cancel-order endpoint, so the order is cancelled and stock is freed, then lands the shopper on `cancel_path`. Without a `cancel_path` it falls back to `/cart`.

Both paths are relative only. A value carrying a scheme or a `//` prefix is rejected and the default is used, so a checkout request cannot redirect the shopper off-site. The Site URL host is already trusted for these redirects; nothing happens when no Site URL is set.

Some order-pay exits return the browser to the WordPress `/checkout` page rather than the cancel-order endpoint. With an empty native cart, WooCommerce redirects that request to `/cart` before any order filter runs, and it carries no order id or key. To keep `cancel_path` across that gap, the order-pay page stamps a short-lived, one-time context in the WooCommerce session, and only that empty-checkout redirect reads it back to reach `cancel_path`. This changes nothing else: it never alters the order's status, stock, or any provider-owned cancellation behaviour, and ordinary cart links and checkout navigation are untouched. When two order-pay pages are open in one session, the final request cannot say which order it belongs to, so the redirect keeps WooCommerce's `/cart`.

## Embedding the order-pay page

Starting a payment returns a `payment_result.redirect_url` to WooCommerce's order-pay page, where the gateway loads. WooCommerce protects checkout responses with `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'`, so a headless storefront on a different origin cannot present that page inside a modal iframe.

When a Kizlo Site URL is configured, the order-pay response permits that one exact origin (scheme, host, and port) to frame it. No setting gates this; the configured Site URL is the trusted storefront. Every other response, including account pages, ordinary checkout, and unrelated WordPress routes, keeps WooCommerce's framing protection unchanged, and nothing changes at all when no Site URL is set.

Keep these in mind when framing the order-pay page:

- **Use HTTPS for the production Site URL.** A browser only honours a cross-origin frame ancestor over a secure context.
- **Verify payment completion server-side.** Framing the pay page does not change how payment state is confirmed. Read the order status through WooCommerce rather than trusting iframe navigation.
- **Keep a top-level fallback.** Some gateways, including bank 3-D Secure steps, refuse to run inside a nested frame. Open the pay URL in the full window when the frame is blocked.

## Development

Dev loop, linting, tests, and PR conventions live in the monorepo's [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

GPLv2 or later. See the plugin header in [`kizlo-woocommerce.php`](kizlo-woocommerce.php).
