---
name: wc-types
description: Convert a WooCommerce admin core REST API resource (docs URL or resource name) into TypeScript interfaces for this repo. Use when the user asks to generate, scaffold, or convert WooCommerce admin core REST API types into a types.ts (or types.wc.ts) file. Targets the admin core API (`/wc/v3/*`) only — for the public Store API (`/wc/store/v1/*`), use the separate [[wcs-types]] skill. Docs-first: the admin docs at `woocommerce.github.io/woocommerce-rest-api-docs` carry full property tables AND per-endpoint argument tables — PHP is only needed for error codes (which the docs don't list). Produces the raw API surface with the project's WC_ naming convention.
---

# wc-types — generate raw WooCommerce admin core REST API types

Purpose: when the user names an admin core resource (e.g. `products`, `orders`, `customers`) or points at a section of the WC admin REST docs (e.g. `https://woocommerce.github.io/woocommerce-rest-api-docs/#products`), produce a complete TypeScript types file — written into the file the user has open, or a `types.wc.ts` / `types.ts` next to the corresponding `schema.ts`.

This skill is the admin-core counterpart of [[wcs-types]] (Store API) and a sibling of [[wp-types]] (WordPress core). The output SHAPE (per-endpoint `*Input` + `*ErrorCode` unions, JSDoc, completeness table) is the same. The SOURCES split differs:

- **Docs first** (`woocommerce.github.io/woocommerce-rest-api-docs/#<resource>`) — the admin docs are comprehensive: property table with name/type/description/context (read-only), plus per-endpoint argument tables. Unlike the Store API docs, you do NOT need PHP for the response shape or field descriptions.
- **PHP fallback** (only for errors, and for fields the docs flat-out miss) — error codes are not listed in the docs. Source of truth is the controller class on `trunk`, plus its WC inheritance chain (V3 → V2 → V1 → `WC_REST_CRUD_Controller` → `WC_REST_Posts_Controller`).

Optimize for speed: don't open PHP for the response schema or argument tables unless the docs are visibly incomplete. ALWAYS open PHP for errors.

## Inputs

- **A resource group** — required. Either the name (`products`, `orders`, `customers`, `coupons`, `product_variations`, `product_categories`, etc.) or the docs URL with an anchor (e.g. `https://woocommerce.github.io/woocommerce-rest-api-docs/#products`).
- **Target file** — usually the file the user has open in the IDE. Conventional name is `types.wc.ts` when a sibling `types.wcs.ts` exists (split admin vs. Store API), otherwise `types.ts`. Lives next to the resource's `schema.ts` (e.g. `packages/woocommerce/src/product/types.wc.ts`).

If either input is missing, ask before doing anything else.

## Process

### 1. Fetch the docs section

Single docs URL with anchors: `https://woocommerce.github.io/woocommerce-rest-api-docs/#<resource>`.

WebFetch with this prompt (be aggressive — the page is huge, the model will summarize if you let it):

> Extract everything in the `#<resource>` section. Required output:
> 1. The "<Resource> properties" table verbatim (name | type | description | context). Include the read-only and context flags exactly as shown.
> 2. Every endpoint sub-section ("Retrieve a <resource>", "List all <resources>", "Create a <resource>", "Update a <resource>", "Delete a <resource>", "Batch update <resources>"). For each, output: HTTP method, path, and the "Available parameters" / "Arguments" table verbatim (name | type | description). Note required vs optional based on the docs.
> Do not summarize. Do not collapse columns.

Cross-check counts after fetching. Top-level resources like `products` reliably document 60+ properties and 30+ list args. If your fetch returned <10 fields total, the model summarized — re-fetch with a more aggressive prompt or split the request per endpoint.

The docs page renders some sub-resources (variations, categories, attributes, tags, shipping classes, reviews) under separate anchors (`#product-variations`, `#product-categories`, …). If the resource has these, fetch each anchor needed.

### 2. Generate the response schema (`WC_<Resource>`) from the docs property table

The admin docs property table gives the field name, JSON type, description, and context flags. This is more than enough — do not fall back to PHP unless the table is missing fields.

- `integer` → `number`
- `string` (any subtype: email, uri, date-time) → `string`
- `boolean` → `boolean`
- `array` of primitives → `number[]` / `string[]` / etc.
- `array` of objects → `WC_<ParentField>[]` referencing a supporting interface
- `object` with documented shape → nested `interface WC_<ParentField>` (e.g. `WC_ProductImage`, `WC_ProductDimensions`, `WC_ProductMetaData`)
- `object` with no documented shape → `Record<string, unknown>`
- Enum strings (docs say "Options: a, b, c") → string literal union, defined as a SHARED type if reused

**Context handling:** WC admin docs annotate fields as `read-only` and sometimes specify which `context` they appear in. For the response schema (`WC_<Resource>`):

- Type the **`edit` context surface** — the complete object. By default, fields the docs mark as `edit`-only are required. Kizlo's server pins `context: "edit"` on every WC fetch (see [[feedback-wp-types-edit-context]] / [[project-kizlo-fetch-full-trim-output]] — same project rule applies to WC), so the field IS in the response.
- **But "is in the response" ≠ "must have a value."** Keep a field `?:` when the docs themselves describe it as conditionally present — language like "if set", "when assigned", "when …", "only when", or a field whose semantic clearly depends on optional state (parent ID on a root item, sale price when not on sale, etc.). Don't force `?:` away just because the field appears in the edit-context table.
- Drop any "Only present in `edit` context" JSDoc notes — the type itself is the edit shape. Keep "if set" / "when assigned" qualifiers that justify the `?:`.
- The `read-only` flag does NOT affect the response type — it only excludes the field from create/update inputs (handled in step 3).

**JSDoc on response fields:** every property gets a JSDoc `/** ... */` with the verbatim description from the docs property table. Do not paraphrase. If the field is read-only, append ` Read-only.` to the JSDoc.

### 3. Generate `*Input` types from the endpoint argument tables

For each endpoint in the docs, one `WC_<EndpointName>Input` interface. The endpoint name follows the canonical table below.

**Canonical endpoints — top-level resource (products / orders / customers / coupons):**

| Doc endpoint | HTTP | Endpoint name (`WC_<name>Input` / `WC_<name>ErrorCode`) |
|---|---|---|
| `/<resource>` | GET | `<Resource>List` |
| `/<resource>` | POST | `<Resource>Create` |
| `/<resource>/<id>` | GET | `<Resource>Retrieve` |
| `/<resource>/<id>` | PUT | `<Resource>Update` |
| `/<resource>/<id>` | DELETE | `<Resource>Delete` |
| `/<resource>/batch` | POST | `<Resource>Batch` |

`<Resource>` is the singular form (`Product`, `Order`, `Customer`, `Coupon`).

**Sub-resources** (product variations, categories, attributes, attribute terms, tags, shipping classes, reviews, order notes, order refunds): apply the same six-endpoint pattern, but namespace under the parent — e.g. `ProductVariationList` / `ProductVariationCreate` / `ProductVariationRetrieve` / `ProductVariationUpdate` / `ProductVariationDelete` / `ProductVariationBatch`. Paths like `/products/<product_id>/variations/<id>` carry both `product_id` and `id` — both become required fields on the relevant `*Input`.

**Per-field rules for `*Input`:**

- Each row in the args table → one field on the interface, with type, JSDoc description verbatim from the docs.
- Path-bound params (`id`, `product_id`, etc.) are always required.
- All other fields are optional (`?:`) unless the docs explicitly mark them required.
- `read-only` fields from the property table NEVER appear in Create/Update inputs.
- Body fields on Create/Update mirror the response property's type, EXCEPT:
  - `meta_data`: input takes `Array<{ key: string; value: unknown }>` (id optional on input); response carries id.
  - Object-valued args (e.g. `billing`, `shipping` on customers/orders, `dimensions` on products) reuse the same supporting interface from the response schema.
- For LIST filter fields that look enum-y but the docs say "Options: a, b, c" — define the enum as a SHARED type and reuse it. If the docs label a field `string` with no options, leave as `string` (do not invent an enum from the response shape — see [[no-legacy-archaeology]]).
- DELETE `force` param: docs say boolean; type as `boolean`.

**DELETE response shape:** WC admin DELETE returns the deleted resource (or moved-to-trash). Emit `export type WC_<Resource>DeleteResponse = WC_<Resource>` unless the docs document a distinct envelope.

**BATCH input shape:** WC batch endpoints take `{ create?: WC_<Resource>CreateInput[]; update?: Array<WC_<Resource>UpdateInput & { id: number }>; delete?: number[] }`. Emit this shape directly — do NOT chase the PHP. Response is `{ create?: WC_<Resource>[]; update?: WC_<Resource>[]; delete?: WC_<Resource>[] }`.

### 4. Generate per-endpoint error code unions from PHP

The docs do NOT list error codes. PHP is the source of truth. The V3 controller is thin and delegates upward — walk the WC inheritance chain.

Fetch the chain with `curl` (faster than WebFetch — no model summarization). For `products`:

```bash
mkdir -p /tmp/wc-errors && cd /tmp/wc-errors
BASE='https://raw.githubusercontent.com/woocommerce/woocommerce/trunk/plugins/woocommerce/includes/rest-api/Controllers'
curl -sL "$BASE/Version3/class-wc-rest-products-controller.php"        -o products-v3.php
curl -sL "$BASE/Version2/class-wc-rest-products-v2-controller.php"     -o products-v2.php
curl -sL "$BASE/Version1/class-wc-rest-products-v1-controller.php"     -o products-v1.php
curl -sL "$BASE/Version3/class-wc-rest-crud-controller.php"            -o crud.php
curl -sL "$BASE/Version3/class-wc-rest-posts-controller.php"           -o posts.php
```

(Adjust filenames per resource — `orders`, `customers`, `coupons` follow the same V3/V2/V1 layering. Some sub-resources have shorter chains.)

Extract `new WP_Error(...)` calls per file with a balanced-paren scan to catch multi-line throws — single-line `grep` will miss them:

```bash
python3 << 'EOF' products-v3.php
import re, sys
src = open(sys.argv[1]).read()
# Track enclosing function for grouping
func_re = re.compile(r'function\s+(\w+)\s*\(')
funcs = [(m.start(), m.group(1)) for m in func_re.finditer(src)]
def enclosing(pos):
    name = None
    for start, n in funcs:
        if start < pos: name = n
        else: break
    return name
for tm in re.finditer(r'new WP_Error\(', src):
    pos = tm.start()
    depth, i = 0, pos + len('new WP_Error')
    while i < len(src):
        c = src[i]
        if c == '(': depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0: end = i + 1; break
        i += 1
    call = src[pos:end]
    code_m = re.search(r"['\"]([a-z_]+(?:_[a-z0-9_]+)+)['\"]", call)
    status_m = re.search(r"['\"]status['\"]\s*=>\s*(\d{3})", call) or re.search(r",\s*(\d{3})\s*\)", call)
    print(f"{enclosing(pos) or '?'} | {code_m.group(1) if code_m else '?'} | {status_m.group(1) if status_m else '?'}")
EOF
```

**Method → endpoint mapping** (same as [[wp-types]]):

| Endpoint | Methods whose errors fold in |
|---|---|
| List     | `get_items_permissions_check`, `get_items` |
| Retrieve | `get_item_permissions_check`, `get_item`, plus helpers it calls (e.g. `get_object`, `get_post`) |
| Create   | `create_item_permissions_check`, `create_item`, `prepare_object_for_database`, `prepare_item_for_database` |
| Update   | `update_item_permissions_check`, `update_item`, plus helpers |
| Delete   | `delete_item_permissions_check`, `delete_item`, plus helpers |
| Batch    | `batch_items_permissions_check`, `batch_items` (folds into the per-action errors too — see below) |

**Batch folding:** `batch_items` typically iterates and calls `create_item` / `update_item` / `delete_item` internally, so `WC_<Resource>BatchErrorCode` is the UNION of `<Resource>CreateErrorCode | <Resource>UpdateErrorCode | <Resource>DeleteErrorCode` plus any batch-specific code (`woocommerce_rest_batch_request_*`). Emit it as that union, not as a separate hand-built list:

```ts
export type WC_ProductBatchErrorCode =
    | WC_ProductCreateErrorCode
    | WC_ProductUpdateErrorCode
    | WC_ProductDeleteErrorCode
```

**Helper folding:** the WC controllers often call `$this->get_object( $id )` / `get_post( $id )` from get/update/delete handlers. Fold those errors (typically `woocommerce_rest_<resource>_invalid_id`) into retrieve/update/delete unions. They are NOT called from list, so do not fold there.

**CRUD_Controller / Posts_Controller universal errors → `WC_CommonErrorCode`:**

`WC_REST_CRUD_Controller` and `WC_REST_Posts_Controller` add error codes that apply to every CRUD route across resources (e.g. `woocommerce_rest_cannot_view`, `woocommerce_rest_cannot_edit`, `woocommerce_rest_cannot_create`, `woocommerce_rest_cannot_delete`, `woocommerce_rest_trash_not_supported`). Pull these into a single SHARED `WC_CommonErrorCode` union — they are widened at the class level by `WC_Error<TCode>` (same pattern as [[feedback-wp-error-widening]]). Do NOT include them in per-endpoint unions.

Dedupe within an endpoint. Order codes by HTTP status ascending, then alphabetically.

If an endpoint has zero route-specific errors after folding, emit `export type WC_<EndpointName>ErrorCode = never` (don't omit — keeps the consumer pattern uniform).

### 5. PHP-only fallback (only when docs are visibly thin)

If the docs property table is missing fields the PHP schema clearly defines, or the endpoint args table omits documented filters, fall back to the controller PHP. `register_routes()` shows the args via `get_collection_params()` (list) and `get_endpoint_args_for_item_schema()` (create/update). The schema itself is built in `get_item_schema()`.

Use PHP for the gap only — don't regenerate the whole resource from PHP just because one field is missing.

### 6. Generate the types file

Write the target file in this exact order:

```
// ==================================================
// SHARED
// ==================================================
// WC_Context = "view" | "edit"
// WC_CommonErrorCode = universal CRUD errors from WC_REST_CRUD_Controller / WC_REST_Posts_Controller
// Resource enums shared between response + inputs (e.g. WC_ProductType, WC_ProductStatus, WC_StockStatus, WC_TaxStatus, WC_BackorderStatus, WC_CatalogVisibility, ...)
// WC_Order = "asc" | "desc"
// WC_<Resource>OrderBy unions

// ==================================================
// SUPPORTING SCHEMAS
// ==================================================
// One interface per nested object on the response, in dependency order:
//   WC_ProductDownload, WC_ProductDimensions, WC_ProductImage, WC_ProductAttribute,
//   WC_ProductDefaultAttribute, WC_ProductCategoryRef, WC_ProductTagRef, WC_MetaData, ...

// ==================================================
// <RESOURCE> (response schema)
// ==================================================
// WC_<Resource> — every field from the docs property table, JSDoc verbatim

// ==================================================
// LIST — GET /wc/v3/<resource>
// ==================================================
// WC_<Resource>ListInput
// WC_<Resource>ListErrorCode

// ==================================================
// CREATE — POST /wc/v3/<resource>
// ==================================================
// WC_<Resource>CreateInput
// WC_<Resource>CreateErrorCode

// ==================================================
// RETRIEVE — GET /wc/v3/<resource>/<id>
// ==================================================
// WC_<Resource>RetrieveInput
// WC_<Resource>RetrieveErrorCode

// ==================================================
// UPDATE — PUT /wc/v3/<resource>/<id>
// ==================================================
// WC_<Resource>UpdateInput
// WC_<Resource>UpdateErrorCode

// ==================================================
// DELETE — DELETE /wc/v3/<resource>/<id>
// ==================================================
// WC_<Resource>DeleteInput
// WC_<Resource>DeleteResponse = WC_<Resource>
// WC_<Resource>DeleteErrorCode

// ==================================================
// BATCH — POST /wc/v3/<resource>/batch
// ==================================================
// WC_<Resource>BatchInput
// WC_<Resource>BatchResponse
// WC_<Resource>BatchErrorCode = WC_<Resource>CreateErrorCode | WC_<Resource>UpdateErrorCode | WC_<Resource>DeleteErrorCode
```

**Naming convention (load-bearing — see [[feedback-wc-type-naming]]):**

- All types use the `WC_` prefix with a literal underscore: `WC_Product`, `WC_ProductImage`, `WC_ProductListInput`. NOT `WcProduct` or `WCProduct`. (Compare to `WCS_` for Store API.)
- Response schema: `WC_<Resource>` singular.
- Per-endpoint param types: `WC_<EndpointName>Input` per the canonical table.
- Per-endpoint error code unions: `WC_<EndpointName>ErrorCode`.
- Common error union: `WC_CommonErrorCode` (defined once in SHARED).

**Error code rules:**

- Per-endpoint unions contain ONLY route-specific codes (after delegate folding + dedupe). Do NOT include `WC_CommonErrorCode` and do NOT import it inside per-endpoint unions.
- Order codes by HTTP status ascending, then alphabetically within each status.
- No JSDoc on per-endpoint error unions or on individual code members. See [[feedback-no-jsdoc-clutter]].
- If a route has zero route-specific errors after folding, emit `export type WC_<EndpointName>ErrorCode = never`.

**JSDoc rules:**

- Response fields: verbatim docs description. Append ` Read-only.` if the docs flag it.
- `*Input` fields: verbatim docs description.
- Shared enums and helper interfaces get a one-line JSDoc when the source provides one.
- Skip JSDoc on the obvious (e.g. unions of literals where the type name says it all).

**Type the documented modern surface — no legacy archaeology.** WC controllers carry many legacy aliases (`featured` accepting `"true"`/`"1"`, `status` accepting raw post statuses beyond the documented set, etc.). Stick to the documented vocabulary. Do not present "strict vs. clean" choices — pick clean. See [[no-legacy-archaeology]].

**Style nits (match `schema.ts` and the sibling `types.wcs.ts`):**

- `interface` for object shapes, `type` for unions/aliases.
- Tabs.
- No trailing semicolons inside interfaces.

### 7. Verify completeness before reporting done

Count fields/args from each source and confirm each is present in the file. Report:

```
| Section                          | Source                  | Source count | Present |
| WC_Product                       | docs property table     | N            | N ✓     |
| WC_ProductListInput              | docs args table         | N            | N ✓     |
| WC_ProductListErrorCode          | PHP (V3 + V2 + V1)      | N (deduped)  | N ✓     |
| WC_ProductCreateInput            | docs args table         | N            | N ✓     |
| WC_ProductCreateErrorCode        | PHP (V3 + V2 + V1)      | N (deduped)  | N ✓     |
| WC_ProductRetrieveErrorCode      | PHP + helper folding    | N (deduped)  | N ✓     |
| WC_ProductUpdateErrorCode        | PHP + helper folding    | N (deduped)  | N ✓     |
| WC_ProductDeleteErrorCode        | PHP + helper folding    | N (deduped)  | N ✓     |
| WC_ProductBatchErrorCode         | union of create/update/delete | —     | ✓       |
| ... etc per sub-resource
```

The Source column makes it obvious which sections came from docs vs PHP — useful when validating later.

## Reference example

(none yet — once a generated `types.wc.ts` lands in `packages/woocommerce/src/product/types.wc.ts`, link it here as the canonical output. New generations should match its shape.)

## Out of scope

- This skill does NOT touch `schema.ts` (the internal Zod domain model).
- This skill does NOT generate fetch clients, service code, or zod schemas — only the raw TypeScript surface.
- This skill does NOT cover the Store API (`/wc/store/v1/*`) — use [[wcs-types]].
- This skill does NOT cover WordPress core endpoints (`/wp/v2/*`) — use [[wp-types]].
- If the user points at a Store API docs page (`developer.woocommerce.com/docs/apis/store-api/...`) or a WP REST page (`developer.wordpress.org/rest-api/reference/...`), stop and route them to the correct skill.
