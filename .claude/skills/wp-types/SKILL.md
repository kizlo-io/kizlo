---
name: wp-types
description: Convert a WordPress REST API reference page (developer.wordpress.org/rest-api/reference/...) into TypeScript interfaces for this repo. Use when the user asks to generate, scaffold, or convert WordPress / WP REST API types from a docs URL into a types.ts file. Produces the raw API surface (response schema + every endpoint's params) with JSDoc taken verbatim from the docs and the project's WP_ naming convention.
---

# wp-types — generate raw WordPress REST API types

Purpose: when the user points at a WordPress REST API reference URL (e.g. `https://developer.wordpress.org/rest-api/reference/comments/`), produce a complete TypeScript types file mirroring the raw API surface, written into the file the user has open (or a `types.ts` next to the corresponding `schema.ts`).

## Inputs

- **A WordPress REST API reference URL** — required.
- **Target file** — usually the file the user has open in the IDE. If none is open or ambiguous, ask. The file should be named `types.ts` and live next to the resource's `schema.ts` (e.g. `packages/blog/src/post/comment/types.ts` sits next to `schema.ts`).

If either input is missing, ask before doing anything else.

## Process

### 1. Fetch the full reference

Use WebFetch on the URL with a prompt that demands **everything**, not just the top-level schema. Required sections:

- Schema (the response object) — every property, type, description, read-only flag, context.
- **Every endpoint's arguments**: List, Create, Retrieve, Update, Delete (whichever the page documents). The WP docs page usually shows: `GET /<resource>`, `POST /<resource>`, `GET /<resource>/<id>`, `POST /<resource>/<id>`, `DELETE /<resource>/<id>`.
- For each argument: exact name, verbatim description text, type, required flag, default, enum/allowed values.

Cross-check counts after fetching. The WP docs reliably list ~17 schema fields and ~20 list args for resources like comments/posts. If your fetch returned ~5 fields total, the model summarized — re-fetch with a more aggressive prompt.

### 1b. Fetch the controller PHP for error codes

The WP docs page does not list error codes. Source of truth is the controller class on `trunk`:

```
https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-includes/rest-api/endpoints/class-wp-rest-<resource>-controller.php
```

(Singular for some resources, plural for others — comments/posts/users use plural; media uses `attachments`; search uses singular `search`. If the obvious URL 404s, try the singular/plural alternate before giving up.)

WebFetch it with a prompt that demands EVERY `new WP_Error(...)` call grouped by enclosing function. Example prompt:

> List every `new WP_Error(...)` call in this file. For each one, output: `METHOD_NAME | error_code | http_status | verbatim message`. Group by enclosing function: `get_items_permissions_check`, `get_items`, `get_item_permissions_check`, `get_item`, `create_item_permissions_check`, `create_item`, `update_item_permissions_check`, `update_item`, `delete_item_permissions_check`, `delete_item`, and helpers like `get_<resource>`, `prepare_item_for_database`, `check_*_permission`. Include every occurrence; do not deduplicate or summarize.

**Mapping rule** (method → endpoint union):

| Endpoint | Methods whose errors fold into its union |
|---|---|
| LIST     | `get_items_permissions_check`, `get_items` |
| RETRIEVE | `get_item_permissions_check`, `get_item`, plus any helper called from them (`get_<resource>`, `check_read_permission`) |
| CREATE   | `create_item_permissions_check`, `create_item`, `prepare_item_for_database` |
| UPDATE   | `update_item_permissions_check`, `update_item`, plus helpers it calls (`get_<resource>`, `prepare_item_for_database`, `check_edit_permission`) |
| DELETE   | `delete_item_permissions_check`, `delete_item`, plus `get_<resource>` |

Helpers like `get_<resource>(id)` are called from get/update/delete handlers — fold their errors into all three. They are NOT called from list, so do not fold them there.

Dedupe within an endpoint (same code appearing in multiple branches collapses to one union member).

### 2. Generate the types file

Write `types.ts` with this exact structure and conventions:

**Naming convention (load-bearing — see [[feedback-wp-type-naming]]):**
- All types use the `WP_` prefix with a literal underscore: `WP_Comment`, `WP_CommentListInput`, `WP_Context`. NOT `WpComment` or `WPComment`.
- The response schema type is `WP_<Resource>` (singular).
- Per-endpoint param types: `WP_<Resource>ListInput`, `WP_<Resource>CreateInput`, `WP_<Resource>RetrieveInput`, `WP_<Resource>UpdateInput`, `WP_<Resource>DeleteInput`.
- Per-endpoint error code unions: `WP_<Resource>ListErrorCode`, `WP_<Resource>CreateErrorCode`, `WP_<Resource>RetrieveErrorCode`, `WP_<Resource>UpdateErrorCode`, `WP_<Resource>DeleteErrorCode`.
- Shared universal error union: `WP_CommonErrorCode` (defined once in SHARED).

**File structure (in this order):**

```
// ==================================================
// SHARED
// ==================================================
// - WP_Context = "view" | "embed" | "edit"
// - WP_ListOrder = "asc" | "desc"
// - resource-specific enums (e.g. WP_CommentStatus, WP_CommentOrderBy)
// - shared shapes used by the response (e.g. WP_CommentContent { rendered; raw? },
//   WP_<Resource>AvatarUrls, WP_Link, WP_<Resource>Links)

// ==================================================
// <RESOURCE> (response schema)
// ==================================================
// WP_<Resource>  — every documented field, plus optional _links

// ==================================================
// LIST — GET /wp/v2/<resource>
// ==================================================
// WP_<Resource>ListInput
// WP_<Resource>ListErrorCode

// ==================================================
// CREATE — POST /wp/v2/<resource>
// ==================================================
// WP_<Resource>ContentInput = string | { raw: string }   (if `content` is in create/update)
// WP_<Resource>CreateInput
// WP_<Resource>CreateErrorCode

// ==================================================
// RETRIEVE — GET /wp/v2/<resource>/<id>
// ==================================================
// WP_<Resource>RetrieveInput
// WP_<Resource>RetrieveErrorCode

// ==================================================
// UPDATE — POST /wp/v2/<resource>/<id>
// ==================================================
// WP_<Resource>UpdateInput
// WP_<Resource>UpdateErrorCode

// ==================================================
// DELETE — DELETE /wp/v2/<resource>/<id>
// ==================================================
// WP_<Resource>DeleteInput
// WP_<Resource>DeleteResponse = WP_<Resource> | { deleted: true; previous: WP_<Resource> }
// WP_<Resource>DeleteErrorCode
```

**Error code rules:**
- Per-endpoint unions contain ONLY resource-specific codes from step 1b, deduped within the endpoint. Do NOT include `WP_CommonErrorCode` in the union and do NOT import it.
- Reason: `WP_Error<TCode>` widens its `code` field to `TCode | WP_CommonErrorCode` at the class level, so framework + transport codes (`rest_invalid_param`, `rest_forbidden`, `unexpected_error`, `unknown_error`, etc.) flow into `result.error.code` automatically. Including `WP_CommonErrorCode` inside each per-endpoint union just duplicates it.
- Order codes by HTTP status ascending, then alphabetically within each status.
- No JSDoc on per-endpoint error unions or on individual code members. The type name (`WP_<Resource>CreateErrorCode`) and the union members are self-documenting. See [[feedback-no-jsdoc-clutter]].

Example shape:
```ts
export type WP_CommentCreateErrorCode =
    | "rest_comment_author_data_required"
    | "rest_comment_content_invalid"
    | "rest_comment_exists"
    // ... resource-specific codes only
```

**JSDoc rules:**
- Every property gets a JSDoc `/** ... */` comment with the **verbatim** description from the WordPress docs. Do not paraphrase.
- If a field is only present in certain contexts (read-only / `edit`-only), append ` Only present in \`edit\` context.` or similar to the JSDoc.
- Shared enums and helper types also get a one-line JSDoc explaining what they represent (use the docs description for the corresponding field).

**Type mapping:**
- `integer` → `number`
- `string` (any subtype: email, uri, ip, datetime) → `string`
- `boolean` → `boolean`
- `object` with no documented shape → `Record<string, unknown>`
- `array` of IDs in query params → `number | number[]` (WP accepts both)
- Enum strings → string literal union
- `content` body in create/update → `string | { raw: string }` (WP accepts either)

**Input field typing — DO NOT default to `string`, but verify enum source before mirroring response:**

The WP argument table in the docs frequently labels enum filter fields as plain `Type: string` without listing the allowed values. **Do not mirror that laziness, but also do not blindly mirror the response enum** — they sometimes diverge (most notably for comments). The source of truth is the controller PHP's `get_collection_params()` method, which you already fetched in step 1b.

**Required check for every `*ListInput` filter field that looks enum-y:**

Open the controller PHP and find the field's entry in `get_collection_params()`. Then:

1. **If the entry has an `'enum' => array(...)` key** — use THOSE values verbatim, even if they differ from the response schema. Define a separate `WP_<Resource><Field>Filter` type if the values diverge from the response enum.
2. **If the entry has NO `enum` key** — WP server-side accepts any string (subject to `sanitize_callback`). Two acceptable typings:
    - `string` (most accurate to WP enforcement)
    - The response enum or a "practical values" enum, IF the practical accepted values are well-known and stable (e.g. `comment | pingback | trackback`). In that case, add a JSDoc comment saying "soft constraint — WP does not enforce" so the next reader knows the type is tighter than WP.
3. **Default to `string`** when uncertain — over-typing a filter creates real bugs (TS rejects values WP would accept).

For filters that accept "one or more" (description contains "one or more", "specific … statuses/types/slugs", or analogous wording), apply the single-or-array pattern: `Enum | Enum[]` (or `string | string[]` if untyped).

**Canonical exception — comments `status` and `type`:**

The WP comments controller's `status` and `type` filter entries have NO `enum` array and use different vocabulary than the response:
- Response `WP_CommentStatus`: `"approved" | "unapproved" | "hold" | "spam" | "trash"` (past tense)
- Filter accepted values: `"approve" | "hold" | "spam" | "trash" | "all"` (present tense, plus `all` alias)
- Create/Update input: `"approve" | "hold" | "spam" | "trash"` (filter values minus `all`)

This is why we have separate `WP_CommentStatusFilter` and `WP_CommentStatusInput` types. Do not collapse them. For `type`, WP enforces nothing, so type as `string` and let the public-input wrapper apply any tighter constraint.

**Type the documented modern surface — no legacy archaeology.** When the controller PHP shows a handler (e.g. `handle_status_param`) that accepts extra legacy aliases beyond the documented values — raw DB ints (`"0"`, `"1"`), toggle verbs (`"unspam"`, `"untrash"`), past-tense duplicates of present-tense values — DO NOT include them in the type. They exist for backwards compatibility with very old WP code paths and pollute autocomplete. Stick to the documented vocabulary the REST API consumer would naturally use. Do not present "strict vs. clean" choices to the user — pick clean. See [[no-legacy-archaeology]].

Concrete examples:
```ts
// ✓ filter has 'enum' in controller PHP matching the schema enum (posts/menus): mirror it
status?: WP_PostStatus | WP_PostStatus[]
```
```ts
// ✓ filter has NO 'enum' AND diverges from response vocabulary (comments status): separate type
status?: WP_CommentStatusFilter | WP_CommentStatusFilter[]
```
```ts
// ✓ filter has NO 'enum' AND no obvious enumeration: keep as string
type?: string
```
```ts
// ❌ wrong — assumed filter mirrors response without checking get_collection_params()
status?: WP_CommentStatus | WP_CommentStatus[]  // 'approved' is not a valid filter value!
```

**Field optionality:**
- In the response schema (`WP_<Resource>`), type the **`edit` context surface** — the complete object. By default, fields the WP docs mark `Context: edit` or `Context: view, edit` are **required**, not optional. Kizlo pins `context: "edit"` on every WP fetch (see [[project-kizlo-fetch-full-trim-output]] / [[feedback-wp-types-edit-context]]), so the field IS in the response.
- **But "is in the response" ≠ "must have a value."** Keep a field `?:` when the docs themselves describe it as conditionally present within edit context — language like "if set", "when assigned", "when …", "only when", or a field whose semantic clearly depends on optional state (custom template slug, post password, parent ID on a top-level item, etc.). Don't force `?:` away just because the field appears in the edit-context table.
- Drop "Only present in `edit` context" JSDoc notes — the type itself is the edit shape now, so the note is misleading clutter. Keep "if set" / "when assigned" qualifiers that justify the `?:`.
- Fields that depend on request flags rather than context (e.g. `_links` needs `_embed`) also stay `?:`.
- In every `*Input` interface, all fields are optional **except** path-bound IDs (`id` in retrieve/update/delete is required).

**Style nits:**
- Use `interface` for object shapes, `type` for unions/aliases.
- Tabs (this repo uses tabs — match `schema.ts`).
- No trailing semicolons inside interfaces (match `schema.ts`).
- Avoid the word "HATEOAS" in comments — cSpell flags it. Use "Hypermedia links" instead.

### 3. Verify completeness before reporting done

**Enum-mirroring cross-check (do this first — it's the most common bug):**
Grep the finished file for every `?: string` inside an `*Input` interface AND for every input field that mirrors a response enum. For each hit, open the controller PHP's `get_collection_params()` and check the field's entry:

- Entry has `'enum' => array(...)` → use those values (define a separate `*Filter` type if they diverge from the response enum).
- Entry has no `'enum'` → either `string` (most accurate) or the response enum with a "soft constraint" JSDoc, but NEVER assume the response enum is the filter enum.

The skill has shipped two distinct bugs here: (1) `status?: string` when WP defined an enum (menu items, posts) and (2) `status?: WP_CommentStatus | WP_CommentStatus[]` when WP defines no enum AND uses a different vocabulary (comments). The cross-check must catch both — go to the PHP, not the schema.

After writing, count fields/args from the docs AND error codes from the controller PHP, then confirm each is present in the file. Report the counts back in a small table so the user can spot gaps:

```
| Section                          | Source count | Present |
| WP_<Resource>                    | N            | N ✓     |
| WP_<Resource>ListInput           | N            | N ✓     |
| WP_<Resource>ListErrorCode       | N (deduped)  | N ✓     |
| ... etc
```

For error code counts, report the deduped count per endpoint (after merging permission-check + handler + helper errors and dropping duplicates).

## Reference example

See `packages/blog/src/post/comment/types.ts` — the canonical output for `https://developer.wordpress.org/rest-api/reference/comments/`. New generations should match this shape exactly.

## Out of scope

- This skill does NOT touch `schema.ts` (the internal Zod domain model). That is a separate, human-curated shape.
- This skill does NOT generate fetch clients, service code, or zod schemas — only the raw TypeScript surface.
- If the URL points at something other than a WP REST API reference page, stop and ask.