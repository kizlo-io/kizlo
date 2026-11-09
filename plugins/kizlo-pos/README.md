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
More on phones and lower in the sidebar on wider screens. Products, Sell, and
Orders are placeholders for later features. Settings shows the current store,
currency, account, version, and WordPress account/logout links. Logging out ends
the current WordPress browser session.

The header's sun/moon button switches the whole app between neutral light/dark
themes. The default follows system appearance. An explicit choice is stored only
in this browser under `kizlo-pos:theme`; blocked storage still allows switching
for the current visit.

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

Future staff endpoints belong in `kizlo-pos/v1`. Use the POS `Permissions::access`
callback plus WooCommerce's resource/action capabilities where applicable.
Kizlo's existing registrar remains administrator-only, and the headless Store
API retains its Application Password guard. Never trust browser bootstrap
identity as server authorization.

Product browsing/sharing, order data, preferences beyond appearance, barcode
input, and sale/payment behavior belong to later features. This foundation has
no separate login, credential vault, external database, offline transaction
system, or production update feed.
