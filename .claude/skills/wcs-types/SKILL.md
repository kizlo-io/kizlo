---
name: wcs-types
description: Convert a WooCommerce Store API resource (docs URL or resource name) into TypeScript interfaces for this repo. Use when the user asks to generate, scaffold, or convert WooCommerce Store API types into a types.ts file. Targets the public Store API (`/wc/store/v1/*`) only — for the admin core REST API (`/wc/v3/*`), use a separate `wc-types` skill. Docs-first: response shape from the public docs JSON example + endpoint args from the docs argument tables, with PHP fallback for response field descriptions and error codes (which the docs don't cover). Produces the raw API surface with the project's WCS_ naming convention (admin core uses WC_).
---

# wcs-types — generate raw WooCommerce Store API types

Purpose: when the user names a Store API resource group (e.g. "cart") or points at a Store API docs page (e.g. `https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/cart`), produce a complete TypeScript types file — written into the file the user has open, or a `types.ts` next to the corresponding `schema.ts`.

This skill is the Store API counterpart of [[wp-types]]. The output SHAPE (per-endpoint `*Input` + `*ErrorCode` unions, verbatim JSDoc, completeness table) is identical. The SOURCE is split:

- **Docs first** (`developer.woocommerce.com/docs/apis/store-api/resources-endpoints/<resource>`) — endpoint paths, HTTP methods, request argument names + types + descriptions, and the response JSON example.
- **PHP fallback** (only as needed) — response field descriptions (the docs only show a JSON example, no field table) and error codes (the docs do not list them).

Optimize for speed: don't open PHP unless the docs are insufficient.

## Inputs

- **A resource group** — required. Either the name (`cart`, `checkout`, `products`, `cart-items`, `cart-coupons`) or the full docs URL.
- **Target file** — usually the file the user has open in the IDE. The file should be named `types.ts` and live next to the resource's `schema.ts` (e.g. `packages/woocommerce/src/cart/types.ts`).

If either input is missing, ask before doing anything else.

## Process

### 1. Fetch the docs page

URL pattern: `https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/<resource>`

WebFetch with this prompt:

> Extract every endpoint documented on this page. For each endpoint output: HTTP method, path, and the full arguments table verbatim (`name | type | description | required`). Then extract the response JSON example for this resource — copy it verbatim. Then list any error response examples shown (code + http status + message). Do not summarize.

Note: `developer.woocommerce.com` returns HTTP 200 for missing pages (soft-404). If the fetched content starts with "Page Not Found" or contains no endpoint table, treat the page as missing and fall back to PHP (see step 5).

### 2. Generate `*Input` types from the endpoint tables

For each endpoint in the docs:

- Endpoint naming follows the canonical table below — same names regardless of whether the source is docs or PHP.
- Each row in the arguments table → one field on the `*Input` interface, with type, JSDoc description verbatim from the docs, and optionality (`required: true` in docs → required; otherwise optional; path-bound params like `key` / `code` → always required).
- Object-valued args (e.g. `billing_address`, `shipping_address` on `update-customer`) reference a shared interface defined in SUPPORTING SCHEMAS.

**Endpoint naming for the cart group:**

| Doc endpoint | HTTP | Endpoint name (`WCS_<name>Input` / `WCS_<name>ErrorCode`) |
|---|---|---|
| `/cart` | GET | `CartGet` |
| `/cart/add-item` | POST | `CartAddItem` |
| `/cart/update-item` | POST | `CartUpdateItem` |
| `/cart/remove-item` | POST | `CartRemoveItem` |
| `/cart/apply-coupon` | POST | `CartApplyCoupon` |
| `/cart/remove-coupon` | POST | `CartRemoveCoupon` |
| `/cart/select-shipping-rate` | POST | `CartSelectShippingRate` |
| `/cart/update-customer` | POST | `CartUpdateCustomer` |
| `/cart/items` (separate docs page) | GET / POST / DELETE | `CartItemsList` / `CartItemsCreate` / `CartItemsDeleteAll` |
| `/cart/items/<key>` | GET / PUT / DELETE | `CartItemRetrieve` / `CartItemUpdate` / `CartItemDelete` |
| `/cart/coupons` (separate docs page) | GET / POST / DELETE | `CartCouponsList` / `CartCouponsCreate` / `CartCouponsDeleteAll` |
| `/cart/coupons/<code>` | GET / DELETE | `CartCouponRetrieve` / `CartCouponDelete` |
| `/cart/extensions` (separate docs page) | POST | `CartExtensions` |

(`Cart.php` is suffixed `Get` to avoid collision with the response schema `WCS_Cart`. `<key>` / `<code>` routes are singularized.)

For the cart group the docs are split across `cart`, `cart-items`, `cart-coupons`, and `cart-extensions` pages — fetch each in step 1.

### 3. Generate the response schema (`WCS_<Resource>`) from the docs JSON example

The docs JSON example gives the field names and the value shape. Derive types from the example values:

- `123` (integer) → `number`
- `"abc"` (string) → `string`
- `true` / `false` → `boolean`
- `[...]` → `Array<element-type>`
- `{...}` → nested `interface WCS_<ParentField>` (named after the parent + field, e.g. `WCS_CartTotals`, `WCS_CartShippingAddress`)
- `null` → union with `null` (e.g. `string | null`)

Generate one supporting interface per nested object that has its own shape (cart item, coupon, fee, shipping rate, totals, etc.). Use the JSON example to extract field names; for field optionality, treat every field shown in the example as required unless the docs explicitly say otherwise.

**JSDoc on response fields:** the docs JSON example does NOT include per-field descriptions. Two options:

1. **Fast** — emit response fields with no JSDoc. Acceptable for a first pass.
2. **Thorough** — for fields where the user wants JSDoc, fall back to the corresponding `Schemas/V1/<Name>Schema.php`'s `get_properties()` and copy the description verbatim. Use this only for the top-level resource and obvious supporting schemas; don't chase the full PHP tree.

Default to (1) unless the user asks for full JSDoc.

### 4. Generate per-endpoint error code unions from PHP

The docs do NOT list error codes. PHP is the source of truth. For each route file in `https://raw.githubusercontent.com/woocommerce/woocommerce/trunk/plugins/woocommerce/src/StoreApi/Routes/V1/`:

Use `curl` (faster than WebFetch — no model summarization) and `grep` to extract error codes:

```bash
mkdir -p /tmp/wc-errors && cd /tmp/wc-errors
BASE='https://raw.githubusercontent.com/woocommerce/woocommerce/trunk/plugins/woocommerce/src/StoreApi/Routes/V1'
for f in Cart.php CartAddItem.php CartUpdateItem.php CartRemoveItem.php \
         CartApplyCoupon.php CartRemoveCoupon.php CartSelectShippingRate.php \
         CartUpdateCustomer.php CartItems.php CartItemsByKey.php \
         CartCoupons.php CartCouponsByCode.php CartExtensions.php \
         AbstractCartRoute.php; do
  curl -sL "$BASE/$f" -o "$f"
done
```

Then extract per-route errors with a balanced-paren scan to capture multi-line throws — a single `grep` will miss them. Per file:

```bash
python3 << 'EOF'
import re, sys
src = open(sys.argv[1]).read()
for tm in re.finditer(r'throw new RouteException\(', src):
    pos = tm.start()
    depth, i = 0, pos + len('throw new RouteException')
    while i < len(src):
        c = src[i]
        if c == '(': depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0: end = i + 1; break
        i += 1
    call = src[pos:end]
    cm = re.search(r"'([^']+)'", call)
    statuses = re.findall(r',\s*(\d{3})\b', call)
    print(f"{cm.group(1) if cm else '?'} | {statuses[-1] if statuses else '?'}")
EOF
```

(Replace `sys.argv[1]` with each filename. The `?` means dynamic code — open that throw and inspect; usually it's wrapping a `WC_REST_Exception` caught from a delegate, in which case fold the delegate's errors.)

**Delegate folding** — when a route handler calls `$this->cart_controller->X()` inside a try/catch wrapping `WC_REST_Exception`, fetch `Utilities/CartController.php` once and run the same extractor against it. Fold the errors from the delegate methods called by each route. Known mapping for the cart group:

| Endpoint | Delegate method(s) in `CartController` |
|---|---|
| `CartAddItem` / `CartItemsCreate` | `add_to_cart` (via `validate_add_to_cart`, `get_product_for_cart`, `parse_variation_data`, `get_variation_id_from_variation_data`, `get_variable_product_attributes`, `throw_default_product_exception`) |
| `CartUpdateItem` / `CartItemUpdate` | `set_cart_item_quantity` |
| `CartApplyCoupon` / `CartCouponsCreate` | `apply_coupon` (via `validate_cart_coupon`) |
| `CartSelectShippingRate` | `select_shipping_rate` |
| `CartGet` and other read-only routes | none |

Dedupe within an endpoint. Order codes by HTTP status ascending, then alphabetically.

### 4b. Universal cart-route errors → inline per endpoint

`AbstractCartRoute.php` catches errors common to every cart route. As of trunk these are:

- 401 `woocommerce_rest_missing_nonce`
- 403 `woocommerce_rest_invalid_nonce`
- 500 `woocommerce_rest_unknown_server_error`

**Inline these three codes into every per-endpoint `*ErrorCode` union** — do NOT emit a shared `WCS_CommonCartErrorCode` type. There is no `WCS_Error<TCode>` class doing class-level widening (unlike WP), so a shared type would silently disappear from handler switches. Inlining keeps each endpoint's union self-contained and forces the handler to switch on them. Same spirit as [[feedback-wc-verb-permission-errors-inline]].

Place the three codes at the very end of each union (after `woocommerce_rest_cart_error` if present), so the cart-route common errors are visually grouped and easy to spot. Aliases (e.g. `WCS_CartItemsCreateErrorCode = WCS_CartAddItemErrorCode`) inherit them automatically. Open `string` unions (e.g. `WCS_CartExtensionsErrorCode`) already absorb them.

For a future non-cart group (e.g. checkout), inline the corresponding abstract route's errors per endpoint by the same rule — never emit a shared common bucket.

### 5. PHP-only fallback (when docs are missing or thin)

If the docs page is a soft-404, or the endpoint argument table is missing fields the PHP `get_args()` actually defines, fall back to the route PHP for that endpoint:

```bash
curl -sL "https://raw.githubusercontent.com/woocommerce/woocommerce/trunk/plugins/woocommerce/src/StoreApi/Routes/V1/<Route>.php" -o /tmp/<Route>.php
```

Read it and extract `get_args()`. Same for response schema if the docs JSON example is missing entries — read `Schemas/V1/<Resource>Schema.php`. Use PHP for the gap only, not the full tree.

### 6. Generate the types file

Write `types.ts` in this exact order:

```
// ==================================================
// SHARED
// ==================================================
// WCS_Context = "view" | "edit"
// WCS_CommonCartErrorCode = the three universal cart-route errors

// ==================================================
// SUPPORTING SCHEMAS
// ==================================================
// One interface per nested object in the response JSON example, in dependency order:
//   WCS_CartItem, WCS_CartItemQuantityLimits, WCS_CartItemPrices, WCS_CartItemTotals,
//   WCS_CartCoupon, WCS_CartFee, WCS_CartShippingRate, WCS_CartShippingAddress,
//   WCS_CartBillingAddress, WCS_CartError, WCS_CartTotals, ...

// ==================================================
// CART (response schema)
// ==================================================
// WCS_Cart — every field from the docs JSON example

// ==================================================
// GET /cart
// ==================================================
// WCS_CartGetInput
// WCS_CartGetErrorCode  (emit `= never` if no route-specific errors — keeps the shape consistent)

// ==================================================
// POST /cart/add-item
// ==================================================
// WCS_CartAddItemInput
// WCS_CartAddItemErrorCode

// (...one block per row in the canonical endpoint table, in the order listed)
```

**Naming convention (load-bearing — see [[feedback-wp-type-naming]] for the WP analogue):**

- All types use the `WCS_` prefix with a literal underscore: `WCS_Cart`, `WCS_CartItem`, `WCS_CartAddItemInput`. NOT `WcCart` or `WCCart`.
- Response schema: `WCS_<Resource>` singular.
- Per-endpoint param types: `WCS_<EndpointName>Input` per the canonical table.
- Per-endpoint error code unions: `WCS_<EndpointName>ErrorCode`.
- Group-wide universal error union: `WCS_CommonCartErrorCode` (defined once in SHARED).

**Error code rules:**

- Per-endpoint unions contain ONLY route-specific codes (after delegate folding + dedupe). Do NOT include `WCS_CommonCartErrorCode` and do NOT import it inside per-endpoint unions.
- Order codes by HTTP status ascending, then alphabetically within each status.
- No JSDoc on per-endpoint error unions or on individual code members. See [[feedback-no-jsdoc-clutter]].
- If a route has zero route-specific errors after folding, emit `export type WCS_<EndpointName>ErrorCode = never` (don't omit — keeps the consumer pattern uniform).

**JSDoc rules:**

- `*Input` fields: JSDoc with the verbatim description from the docs argument table.
- Response fields: no JSDoc by default (the docs JSON example doesn't carry descriptions). If the user asks for full descriptions, fall back to PHP `Schemas/V1/<Name>Schema.php`'s `get_properties()` per [[feedback-no-jsdoc-clutter]] — only on the top-level schema, not the whole tree.
- Shared enums and helper interfaces get a one-line JSDoc when source provides one.

**Style nits (match `schema.ts`):**

- `interface` for object shapes, `type` for unions/aliases.
- Tabs.
- No trailing semicolons inside interfaces.

### 7. Verify completeness before reporting done

Count fields/args from the sources and confirm each is present in the file. Report:

```
| Section                          | Source                  | Source count | Present |
| WCS_CartItem                      | docs JSON example       | N            | N ✓     |
| WCS_Cart                          | docs JSON example       | N            | N ✓     |
| WCS_CartGetInput                  | docs args table         | N            | N ✓     |
| WCS_CartGetErrorCode              | PHP (route + delegates) | N (deduped)  | N ✓     |
| WCS_CartAddItemInput              | docs args table         | N            | N ✓     |
| WCS_CartAddItemErrorCode          | PHP (route + delegates) | N (deduped)  | N ✓     |
| ... etc
```

The Source column makes it obvious which sections came from docs vs PHP — useful when validating later.

## Reference example

(none yet — once a generated cart `types.ts` lands in `packages/woocommerce/src/cart/types.ts`, link it here as the canonical output. New generations should match its shape.)

## Out of scope

- This skill does NOT touch `schema.ts` (the internal Zod domain model).
- This skill does NOT generate fetch clients, service code, or zod schemas — only the raw TypeScript surface.
- This skill does NOT cover non-Store-API endpoints (admin `/wc/v3/*`, legacy `/wc-api/*`).
- If the user points at a WP REST API page (`developer.wordpress.org/rest-api/reference/...`), stop and route them to [[wp-types]] instead.
