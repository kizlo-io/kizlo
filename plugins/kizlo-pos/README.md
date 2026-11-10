# Kizlo POS

A separate WordPress plugin serving a full-screen React workspace at your site's
`/pos/` address, including installations in a subdirectory.

## Open POS

Install and activate Kizlo **0.20.0+**, WooCommerce **11.0.1+**, and the built
Kizlo POS ZIP. Open `/pos/` and use the normal WordPress sign-in. Administrators
and Shop Managers see the same interface; other accounts cannot enter. Existing
wp-admin permissions remain in place.

The plugin owns its HTML template, assets, and browser state. It does not create
a page or change your theme. If existing content owns `/pos/`, the Plugins screen
shows a notice: move or rename that content before using POS. React navigation
uses hashes, so refreshing a screen stays on the WordPress-owned page.

## Included screens

Products and Sell are the primary destinations. Orders and Settings appear under
More on phones and lower in the sidebar on wider screens. Products shows the current published WooCommerce catalog. Sell and Orders remain
placeholders for later features. Settings shows the current store,
currency, account, version, and links to POS settings and the WordPress account. Logging out ends
the current WordPress browser session.

The header's sun/moon button switches the whole app between neutral light/dark
themes. The default follows system appearance. An explicit choice is stored only
in this browser under `kizlo-pos:theme`; blocked storage still allows switching
for the current visit.

## Browse and share products

Search by part of a product name or an exact SKU/barcode. Exact matches appear
first; matching variations open with that option selected. Load more fetches the
next 24 products. Returning to Products reuses its cached pages. Active product
queries refresh on window focus, reconnection, and every 60 seconds while the app
is visible. Refresh reloads the current search from page one. The cache is kept
in memory, not stored offline.

Open a card for its description, SKU, price, stock state, and published variation
choices. Out-of-stock items remain visible. Draft, private, scheduled, and
password-protected products are excluded. Prices follow WooCommerce's current
sale, currency, and display-tax settings. A variation can be inspected and shared;
this screen does not add products to a sale.

Share product opens the browser/OS share sheet with one main image and a caption
rendered from the store's template. A selected variation uses its own main image,
falling back to the parent's main image. Gallery images are not sent. The caption
is shown in product details before sharing, and a public website is not required.

Image preparation is limited to 5 MiB and requires public image loading, browser
file support, and HTTPS or supported localhost. If the image is unavailable,
sharing keeps the caption. A failed native share offers an explicit text-only
retry; cancelling never opens another sheet or writes to the clipboard. Caption
preservation and destinations, including WhatsApp, depend on the device and app.

Without native sharing, Share product copies the caption, including when there is
no public URL. Copy link appears when a safe public link exists. Blocked clipboard
access shows selectable text. Sharing never includes WordPress session credentials
or management links. Camera and
keyboard-scanner capture belong to a later feature.

Configure the store-wide caption in **WooCommerce → Settings → Kizlo → POS**.
Use plain text with `{{name}}`, `{{price}}`, `{{sku}}`, `{{description}}`, `{{stock}}`,
`{{store_name}}`, and optional `{{url}}` tags. The default is:

```text
{{name}}
{{price}}

{{description}}
```

Values come from the selected product or variation; prices follow WooCommerce's
currency and display-tax settings. Missing values become empty text. An empty
template restores the default, unknown tags are rejected, and a template whose
values are all empty falls back to the default caption. Tags in product content
are never evaluated. Save in WooCommerce and refresh product details in POS.

The Kizlo tab uses WooCommerce's native settings save and permissions. Other
integrations can add sections and fields through `woocommerce_get_sections_kizlo`
and `woocommerce_get_settings_kizlo` without adding another settings tab.

## Develop and verify

Run from the repository root:

```bash
pnpm install
pnpm --filter @kizlo/plugin-pos build
pnpm --filter @kizlo/plugin-pos typecheck
pnpm --filter @kizlo/plugin-pos test
pnpm build
pnpm kizlo test
pnpm plugin:build kizlo-pos
node scripts/check-versions.mjs kizlo-pos
```

The shared dev/test fixtures mount and activate POS after WooCommerce and Kizlo.
`pnpm kizlo test` runs its PHPUnit suite when Docker is running and Composer dev
dependencies are installed. The ZIP includes the emitted JS/CSS/asset manifest
and runtime autoloader; development sources, tests, and tools are excluded.

## Extend the app

`window.kizloPos` carries the minimal server bootstrap before the module loads.
The frontend validates that shape and initializes `@wordpress/api-fetch` with the
site's REST root and `wp_rest` nonce. Import the configured client from the POS
`api.ts` module for relative, typed calls. Errors retain their rejected promises;
expired sessions/nonces offer normal WordPress sign-in or a reload.

TanStack Query owns catalog and variation pagination, product-detail requests,
and share-image preparation. Query functions pass its abort signal to the
WordPress client. Data is fresh for 60 seconds and inactive product queries stay
in memory for 30 minutes. Navigation reuses the cache without a mount refetch;
window focus/reconnection refresh active queries, and visible queries poll every
60 seconds. Hidden and inactive queries do not poll. Refresh resets paging.
Prepared share-image files are released when inactive and are not polled or
refetched on focus. Background network/server failures retain the last loaded
product details; access failures still show normal session recovery. Failures
offer explicit retries without automatic retry loops.

Client controls use local shadcn/ui Button, Input, Textarea, and Sheet components.
Tailwind is built with the plugin and uses the existing light/dark theme tokens;
the product sheet portal stays inside that theme. WooCommerce's PHP settings
screen continues to use native WooCommerce fields. `components.json` configures
the POS component paths, and `THIRD-PARTY-NOTICES.txt` includes shadcn's license.

Read-only product list, detail, and paginated variation endpoints live in
`kizlo-pos/v1/products`. They use current WordPress cookie/nonce authentication,
fixed 24-item pages, bounded search input, and published-product read permissions.
Future staff endpoints belong in `kizlo-pos/v1`. Use the POS `Permissions::access`
callback plus WooCommerce's resource/action capabilities where applicable.
Kizlo's existing registrar remains administrator-only, and the headless Store
API retains its Application Password guard. Never trust browser bootstrap
identity as server authorization.

Order data, preferences beyond appearance, barcode input, and sale/payment
behavior belong to later features. This foundation has
no separate login, credential vault, external database, offline transaction
system, or production update feed.
