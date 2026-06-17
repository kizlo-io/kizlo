---
name: procedure-errors
description: Generate the `error.ts` and wire the per-procedure switch/log/throw flow for a Kizlo OpenAPI router that calls a WP or WCS resource. Use when the user asks to "handle the errors", "scaffold errors", "wire error handling", or "add error maps" for a procedure file (e.g. `cart/index.ts`, `post/index.ts`) where each procedure calls `wordpress.get/post/...` with a `WP_*ErrorCode` / `WCS_*ErrorCode` union. Produces a sibling `error.ts` with per-procedure `*_ERROR_MAP` constants (via `defineErrorMap`) and refactors each procedure to `errors:`-config + `switch (response.error.code)` + `errors.XXX({ message })` cases + `default → context.logger.error + errors.INTERNAL_SERVER_ERROR()`.
---

# procedure-errors — wire procedure error handling

Purpose: given a router `index.ts` whose procedures call the WP/WCS transport (`context.service.wordpress.get/post/put/delete<TData, T*ErrorCode>(...)`), produce the sibling `error.ts` and rewrite each procedure's error branch to use the typed error map. The output is the canonical pattern used by `packages/kizlo/src/post/index.ts` + `error.ts`.

## Inputs

- **Target router file** — usually the `index.ts` the user has open. Each procedure inside is built with `createOpenApiProcedure(config, handler)` and the handler issues at least one transport call typed `<TData, T*ErrorCode>`.
- **Sibling `types.ts` / `types.wcs.ts`** — must export the `WP_*ErrorCode` / `WCS_*ErrorCode` unions referenced by the transport calls. These unions are the authoritative input — never invent codes that aren't in them.
- **Existing schema (`schema.ts`)** — needed to judge which upstream codes are real client errors vs schema drift (see [Decision principles](#decision-principles)).

If the transport calls in `index.ts` are typed `<TData>` (no error code generic) or `<TData, never>`, stop and ask the user to add the `*ErrorCode` generic first — without it the switch is unsafe.

## Process

### 1. Inventory the procedures

For each procedure in the router, record:

- The procedure key (`get`, `update`, `items.add`, `coupons.apply`, ...).
- The endpoint path + method.
- The transport call's `T*ErrorCode` generic (`WCS_CartAddItemErrorCode`, `WP_PostListErrorCode`, ...).
- The literal codes in that union (read them from `types.ts` / `types.wcs.ts`).
- Whether the matching input field is validated upstream by the Zod schema in the procedure config (`body`, `params`, `query`).

Don't skip generic-only codes like `woocommerce_rest_cart_error` / `internal_server_error` — they need an explicit decision (almost always: default → log + 500).

### 2. Decide the mapping for each code

Apply [Decision principles](#decision-principles) per code. The output of this step is a per-procedure list:
`upstream_code → ERROR_NAME` or `upstream_code → default (log + 500)`.

Group codes that semantically collapse to one client error (e.g. all four "variation data is broken" codes → `CART_VARIATION_INVALID`). Don't preserve distinctions clients can't act on.

If the union is documented as **narrower than reality** (look for type comments like *"X also re-throws a dynamic code"* / *"treat as wider string at the handler boundary"*), widen the union in `types.ts` to include the realistic codes BEFORE wiring the switch — otherwise the case labels won't type-check and the client misses important errors. The widened union must still be a literal-string union, not `string`.

### 3. Emit / extend `error.ts`

Write to the sibling `error.ts` (or extend if it already exists). One `*_ERROR_MAP` per procedure that has at least one client-facing case; omit the map for procedures whose only outcome is default → 500 (and just don't pass `errors:` for those).

```ts
import { defineErrorMap } from "kizlo"

export const ADD_CART_ITEM_ERROR_MAP = defineErrorMap({
	CART_ITEM_OUT_OF_STOCK: {
		status: 409,
		message: "Product is out of stock.",
	},
	CART_ITEM_INSUFFICIENT_STOCK: {
		status: 409,
		message: "Not enough stock for the requested quantity.",
	},
	// …
})
export type AddCartItemErrorMap = typeof ADD_CART_ITEM_ERROR_MAP
```

**Load-bearing details:**

- **Naming**: map constant is `<VERB>_<RESOURCE>_<NOUN>_ERROR_MAP` SCREAMING_SNAKE; type alias is the PascalCase form suffixed `ErrorMap`. Pair them with `export type X = typeof X_ERROR_MAP` immediately under the const.
- **Error codes (keys)** are SCREAMING_SNAKE, scoped by resource: `CART_ITEM_OUT_OF_STOCK`, `POST_PASSWORD_INVALID`. Codes describe the **failure state** the client sees, not the upstream cause (`CART_ITEM_OUT_OF_STOCK`, not `STOCK_CHECK_FAILED`).
- **Status codes** follow HTTP semantics: 400 invalid input, 401/403 auth, 404 not found, 409 conflict / state (out of stock, item exists, address conflict), 422 unprocessable, 500 server.
- **Never include `INTERNAL_SERVER_ERROR`, `BAD_REQUEST`, `NOT_FOUND` etc. as keys** — those are widened in via the common error map (see [[feedback_wp_error_widening]] — same principle as the WP type unions).
- **Never write descriptive JSDoc** on map entries (see [[feedback_no_jsdoc_clutter]]).
- **Order the keys by status code ascending**, then alphabetically inside each status group, so 400s read before 404s read before 409s. Easier to spot duplicates / gaps.

### 4. Rewrite each procedure

For every procedure in `index.ts`:

1. Add `errors: <X>_ERROR_MAP` to the `createOpenApiProcedure` config (right after `output:`, before `uses:`).
2. Add `errors` to the destructured handler args: `async ({ context, input, errors }) =>`.
3. Replace the existing error branch with a switch:
   ```ts
   if (response.error) {
   	switch (response.error.code) {
   		case "<upstream_code>":
   			throw errors.<ERROR_NAME>({ message: response.error.message })
   		// …
   		default:
   			context.logger.error("<Verb> <resource> unhandled error", response.error, { code: response.error.code })
   			throw errors.INTERNAL_SERVER_ERROR()
   	}
   }
   ```
4. If the procedure has a path parameter or identifier worth logging, include it in the structured-log metadata object alongside `code` (see post: `{ identifier, code: response.error.code }`). Don't dump the whole input.
5. Update the router type alias so this procedure's `OpenApiProcedure<...>` has the `*ErrorMap` type as the third generic (matching the keys in the new error map):
   ```ts
   add: OpenApiProcedure<{ body: AddCartItemInput }, Cart, AddCartItemErrorMap, SessionContext>
   ```
   Keep the fourth generic (e.g. `SessionContext`) if it was already there — don't change it.

**Load-bearing details:**

- **One switch, no lookup table.** No intermediate `const ERROR_MAP = { ... }` indirection — switch directly on `response.error.code`. See [[feedback_wp_procedure_error_handling]].
- **`default` must log AND throw `errors.INTERNAL_SERVER_ERROR()`** — never silently swallow, never throw the raw upstream `response.error`. The log signature is `context.logger.error(message, error, metadata)` — the user is new to logging (see [[user_new_to_logging]]), so a fixed message template + the WP error object + a metadata object with `{ code }` (and any identifier).
- **Pass `{ message: response.error.message }`** to each typed-error throw so the upstream message reaches the client — that's where WP's human-readable explanation lives. The map's `message` field is the fallback when upstream didn't provide one.
- **No `if (!response.data) throw ...` guards** — the WP/WCS transport returns a discriminated union (`{ data: T, error: null } | { data: null, error: WP_Error }`), so `data` is guaranteed defined once `error` is null. Drop any legacy null checks while you're in there.
- **Drop unused `KizloError` imports** — once every throw goes through `errors.XXX()`, the `KizloError` import is dead. Same for `JsonMetadata` / `Promisify` from `@kizlo/shared` if those came in for the older pattern.

### 5. Verify

After writing:

- Run the package's typecheck (`pnpm --filter <package> exec tsc --noEmit` or `npx tsc --noEmit -p tsconfig.json` from the package dir). Grep for the procedure file path — every case label must match a real literal in the upstream `*ErrorCode` union, every `errors.X()` must be a key in the map (or a common error). If TypeScript flags a case as not assignable, the upstream union doesn't contain that code — go back and check `types.ts`.
- Skim the diff: every procedure must either pass `errors:` + handle the switch, or have no error map AND a default-only switch. No procedure should be left throwing `new KizloError(...)`.

### 6. Report

Short table per procedure: upstream codes → mapped error names, plus any codes deliberately routed to default with a one-line reason (schema drift, generic platform error, etc.). This makes the client-error surface easy for the user to audit.

## Decision principles

For each upstream code, decide between: **typed client error** vs **default (log + 500)**.

### Map to a typed client error when
- The code names a real, recoverable end-user condition (out of stock, item not found, coupon invalid, password wrong, page out of range).
- The code is a state conflict the client should react to differently (item already in cart → switch to update flow).
- The code is an auth/permission outcome (FORBIDDEN, UNAUTHORIZED — usually via the common map, not a custom one).
- The upstream message is safe to surface as-is to the client.

### Default to log + 500 when
- The code is the upstream's generic "something broke" bucket (`woocommerce_rest_cart_error`, `unexpected_error`). Don't manufacture a client-facing meaning it doesn't have.
- The code can only fire if **our Zod schema is misaligned with the upstream's**. The Zod input schema on the procedure config validates first; if `rest_invalid_param` or `missing_X` still arrives, either our schema is looser than the upstream's or we forgot a required field. That's a server-side drift bug, not a client mistake — telling the client "your input is bad" is misleading. Log so we can fix the schema.
- The code is undocumented / dynamic / not in the union at all. Default catches it, the log captures the unknown `code` for follow-up.

### Special-case considerations
- **Field-level validation errors that the upstream returns inside `data.details`** (e.g. WC Store API address-field errors like `invalid_email`, `invalid_country`) do **NOT** surface as `error.code` and the switch cannot see them. Don't pretend to handle them at the switch — they need a separate `data.details` mechanism, out of scope for this skill. Note this in the report so the user knows the gap exists.
- **Stock / quantity errors on quantity-mutating endpoints** (`add`, `update`) are almost always client-facing — even if the documented union omits them. Cross-check the type's comments for warnings like *"X also re-throws Y's codes"*; widen and case them.
- **Generic disabled-feature errors** (`shipping_disabled`, `coupon_disabled`) are server-config decisions but the client still needs to render a clear "not available" — 400 with the upstream message is fine.

## Reference

The canonical examples to mirror:

- **`packages/kizlo/src/post/error.ts`** + **`packages/kizlo/src/post/index.ts`** — the founding pattern for a WP-backed router (`get` + `list`). Note how `GET_POST_ERROR_MAP` and `LIST_POST_ERROR_MAP` carry only the post-specific codes and rely on the common map for `INTERNAL_SERVER_ERROR`.
- **`packages/woocommerce/src/cart/error.ts`** + **`packages/woocommerce/src/cart/index.ts`** — the larger, WCS-backed example with nested routers (`items.add/update/remove`, `coupons.apply/remove`) and procedures that take session middleware. Look here for the per-procedure switch shape, the unhandled-error log format, and the `SessionContext` fourth-generic on `OpenApiProcedure`.

New procedure files should match these in shape exactly — same import groupings, same switch layout, same log-message convention (`"<Verb> <resource> unhandled error"`).

## Out of scope

- The Zod schemas in `schema.ts` — this skill reads them to make decisions, never modifies them. If the schemas need to change to align with the upstream, surface it in the report and let the user do it.
- The transport service (`WordPressService`) — never touched.
- The `data.details` field-level validation path — call it out in the report when relevant, don't try to handle it.
- Adding new procedures, middleware, or routes — only the error path inside existing procedures.
- The router file's output schemas / output mapping (`deserializeCart`, `deserializePost`, ...) — leave alone unless the typecheck forces a change there.
