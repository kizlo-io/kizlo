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
More on phones and lower in the sidebar on wider screens. Products shows the current published WooCommerce catalog. Sell builds a cart and runs checkout. Orders remains
a placeholder for later order browsing. Settings shows the current store,
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
product details on this screen do not add items to a sale.

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
or management links. Camera and keyboard readers are described under [Scan and sell](#scan-and-sell).

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
Checkout and scan endpoints use `kizlo/v1/pos`. Use the POS `Permissions::access`
callback plus WooCommerce's resource/action capabilities where applicable.
Kizlo's existing registrar remains administrator-only, and the headless Store
API retains its Application Password guard. Never trust browser bootstrap
identity as server authorization.

Order browsing, additional preferences, and refunds belong to later features. The app has
no separate login, credential vault, external database, offline transaction
system, or production update feed.

## Scan and sell

Open Sell and scan into the visible barcode field, enter an exact SKU, or choose
a catalog item. Select a specific variation before adding a variable product.
Camera scanning from Products or Sell adds to the current sale and stays open until
you choose Done. A short beep confirms capture, a spinner shows validation, and
green guides confirm the product was added. A red guide, explanation, and short two-note
error tone indicate a missing or unavailable item. Scan different products in
turn; use Scan same item again for another unit of the last barcode. Keyboard/manual
entry beeps after a successful match and follows the current Products or Sell screen.

- **Formats:** EAN-13, UPC-A, EAN-8, Code 128, Code 39. UPC-A and its leading-zero EAN-13 form are equivalent. Native WooCommerce global identifiers take precedence over exact SKUs; duplicate identifiers require correction in WooCommerce.
- **Camera:** phone/tablet layouts and touch devices use a full-screen guide; wide mouse/keyboard layouts use barcode entry. Keep the whole barcode inside the guide, which is decoded at the camera’s original pixel resolution. Camera access needs HTTPS and permission, with manual entry available if denied. The flashlight toggle appears when the active camera supports it and starts off each session. Rejected flashlight changes show a separate error without interrupting scanning. Video stays on-device; closing/hiding the scanner or switching to a desktop-only layout stops the camera and its light.
- **USB/Bluetooth readers:** configure keyboard/HID mode with an Enter/CR suffix in the device or OS. Focus the barcode field; the app does not intercept typing in other inputs. Serial and vendor-specific protocols are unsupported.
- **Validation:** camera additions check purchasability, stock, held/shared stock, sold-individually rules, and cart limits before showing green. Scans never create an order or customer; checkout checks stock again.
- **Cart:** quantities and the current sale pointer survive navigation/reload in this browser for this staff account. Contact details and payment links are not saved in browser draft storage. The cart is not an offline order.

## Configure checkout

Use **WooCommerce → Settings → Kizlo → POS**. Each enabled collection switch
shows and requires that field: first name, last name, email, phone, billing address,
or shipping address. Switches start off. Address forms use WooCommerce country
rules; gateways can require additional genuine customer information.

| Situation | Result |
| --- | --- |
| Email or phone supplied | Reuse the matching customer or create one automatically |
| Neither supplied | Guest order |
| Phone-only new customer | Phone-derived username, native `billing_phone`, marked non-deliverable `@pos.invalid` account email |
| Email and phone match different customers | Stop for staff resolution; accounts are never merged automatically |
| No explicit shipping address | Full configured store address supplies the destination for WooCommerce shipping/tax calculation |

The fallback does not mean free shipping or local pickup. Review the actual rate,
tax, and total before payment. Physical goods need an available configured rate
when shipping is enabled. Store fallback data never replaces a saved customer
address. Phone-only creation does not provide phone OTP login or password recovery;
placeholder addresses cannot receive emails.

## Collect payment

Review sale recalculates prices, stock, shipping, and taxes. Confirm cash collected
records a paid order using `cod`; it does not mean payment on delivery. Normal
fulfillment rules still determine processing versus completed. COD must be
available for the sale, including its virtual-order restrictions.

Pay online creates one pending order. POS settings enable this-device payment,
sending a link, or both, and select the default handoff. The modal uses WooCommerce's
order-pay form and enabled online gateways. Use the separate-page fallback when a
gateway cannot work in a frame. Each gateway needs test-mode verification;
compatibility with every WooCommerce payment plugin is not implied.

### Send a payment request

The order-specific link permits payment without customer login and grants no
account access. It lasts up to 24 hours and stops authorizing payment when paid,
cancelled, or replaced. Email uses WooCommerce's Order details template and needs
a real billing email. Other channels appear when an integration registers them
and reports a valid recipient and configured sender.

Send is an explicit staff action. Queued or accepted means the message was queued
or accepted by its transport, not delivered or paid. Check payment status reads the
actual WooCommerce order. Resend is a separate intentional request; unknown
transport outcomes need provider reconciliation rather than blind retry.

### Recover an interrupted sale

Recover sale status reuses the original sale/order after a timeout. Do not collect
again because a request failed. An uncertain cash/order-save outcome stays in
review with a WooCommerce administration link and cannot offer another payment.
Starting the next sale keeps an already-created pending order in WooCommerce.

Staff can replace an unpaid link, invalidating the old one. An unresolved gateway
attempt blocks another charge or link replacement until WooCommerce/gateway state
establishes failure or success. Use order administration to resolve customer
conflicts, missing gateway details, or uncertain payment state.

## Register a notification channel

Implement `Kizlo\Pos\Modules\Notification\Channel` and add its instance through
`kizlo_pos_notification_channels` after POS loads. Your integration owns credentials,
sender configuration, recipient/consent policy, and provider templates. Do not
expose provider credentials in browser configuration.

```php
use Kizlo\Pos\Modules\Notification\Channel;

final class StoreTextChannel implements Channel
{
    public function id(): string { return 'store_text'; }
    public function label(): string { return 'Store text'; }
    public function events(): array
    {
        return ['pos_payment_request', 'woocommerce_order_status_pending_to_processing'];
    }
    public function unavailable(\WC_Order $order, string $event): ?string
    {
        // Also check your provider configuration and consent requirements.
        return $order->get_billing_phone() === '' ? 'Add a customer phone number.' : null;
    }
    public function send(\WC_Order $order, string $event, string $delivery_id, array $context): array
    {
        // Call your provider with $delivery_id as its idempotency key.
        // For payment requests, use $order->get_checkout_payment_url().
        return ['status' => 'failed']; // Replace with the provider's actual result.
    }
}

add_filter('kizlo_pos_notification_channels', static fn(array $channels): array => [
    ...$channels, new StoreTextChannel(),
]);
```

### Subscribe to order notifications

`events()` uses the WooCommerce trigger name without `_notification`. The bridge
follows registered order-status transitions, completed/failed orders, full/partial
refunds, and customer notes. Non-order stock/account/gateway events are excluded.
Extend the list with `kizlo_pos_order_notification_triggers`; arguments must
identify the order as WooCommerce order triggers do. Context includes the trigger
and available refund/note identifiers. Inspect `get_created_via()` to restrict a
channel to `kizlo-pos` orders.

Channels run independently of email enablement. Native order emails stay with
WooCommerce; the built-in email channel only handles explicit payment requests.
Action Scheduler jobs pass IDs rather than contact data. A delivery ID stays stable
across job retries; a new occurrence or intentional resend gets a new ID. Contact
changes and expired/cancelled orders stop obsolete payment requests. Unknown
outcomes are not automatically resent.

### Report provider delivery

Return `accepted`, `sent`, `failed`, or `unknown`, optionally with `provider_id`.
After verifying a provider webhook in your integration, report its result:

```php
Kizlo\Pos\Modules\Notification\Notifications::report(
    'store_text', $delivery_id, 'sent', $provider_message_id
);
```

This is a trusted PHP integration API, not a public webhook endpoint. No SMS or
WhatsApp vendor, credentials, or production messaging is bundled.

## POS checkout API

Staff operations live under `/wp-json/kizlo/v1/pos`. They require WordPress
cookie/nonce authentication and WooCommerce staff/order permissions. They call
WooCommerce PHP services directly, without HTTP proxying or REST-route dispatch.
The existing headless Store API guard remains unchanged.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/checkout/config` | Field settings, countries, handoff/channel configuration |
| GET | `/barcode?code=...` | Strict barcode or exact-SKU lookup |
| POST | `/cart/scan` | Validate one `code` against supplied `items` (IDs/quantities), without an order or checkout details |
| POST | `/checkout/quote` | Authoritative review from item IDs/quantities and supplied details |
| POST | `/checkout` | Confirm with `sale_id`, `fingerprint`, and `method` (`cash` or `online`) |
| GET | `/checkout/{sale_id}` | Recover this staff account's sale/order status |
| POST | `/checkout/{sale_id}/notifications` | Explicit send with `channel` and a UUID `request_id` |
| POST | `/checkout/{sale_id}/payment-link` | Replace an eligible unpaid link with a UUID `request_id` |

A changed payload with an already-used sale UUID conflicts. Reuse the original UUID
after a lost response. Money uses minor-unit strings with currency/decimal metadata.
Public payment access uses the scoped order capability, not a staff REST nonce.
