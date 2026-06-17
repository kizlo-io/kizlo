---
name: wp-service
description: Generate the `service.ts` for a WordPress REST resource in this repo. Use when the user asks to scaffold, create, or generate the service file for a WP resource (e.g. comment, post, user, media) that already has a `types.ts` produced by the [[wp-types]] skill. Produces a thin class with `list`/`create`/`get`/`update`/`delete` methods wired to `WordPressService`, typed with the per-endpoint `*Input` and `*ErrorCode` unions from the sibling `types.ts`.
---

# wp-service — generate the resource service

Purpose: given a resource's `types.ts` (the output of [[wp-types]]), produce a `service.ts` next to it that exposes thin per-endpoint methods on `WordPressService`. The service is a typed transport wrapper — it does NOT do validation, error translation, or domain conversion. Those happen in higher layers.

## Inputs

- **Sibling `types.ts`** — must exist and follow the [[wp-types]] conventions (`WP_<Resource>`, `WP_<Resource><Verb>Input`, `WP_<Resource><Verb>ErrorCode`). If absent or malformed, stop and ask the user to run [[wp-types]] first.
- **Target file** — usually the `service.ts` the user has open. If none is open, default to `<types-dir>/service.ts`.
- **REST URL path** — usually the plural of the resource name (`comment` → `/comments`, `post` → `/posts`, `media` → `/media`, `user` → `/users`). A few resources are singular (`search` → `/search`, `settings` → `/settings`). If the obvious pluralization is ambiguous, ask the user to confirm.

## Process

### 1. Inspect `types.ts`

Read it and extract:

- **Resource name** — from the response schema type `WP_<Resource>` (singular, PascalCase). Used as the class name prefix.
- **Available endpoints** — which of these types exist:
  - `WP_<Resource>ListInput` + `WP_<Resource>ListErrorCode`     → emit `list`
  - `WP_<Resource>CreateInput` + `WP_<Resource>CreateErrorCode`   → emit `create`
  - `WP_<Resource>RetrieveInput` + `WP_<Resource>RetrieveErrorCode` → emit `get`
  - `WP_<Resource>UpdateInput` + `WP_<Resource>UpdateErrorCode`   → emit `update`
  - `WP_<Resource>DeleteInput` + `WP_<Resource>DeleteErrorCode`   → emit `delete`
- **Delete response type** — if `WP_<Resource>DeleteResponse` is exported, use it as the delete method's data type. Otherwise fall back to `WP_<Resource>`.

Skip any endpoint whose types are missing — don't generate a stub method.

### 2. Check for a sibling `kizlo/` directory

Before emitting the service, look for `<types-dir>/kizlo/service.ts`. If present, the resource has a hand-maintained custom-endpoint extension (see [Kizlo extension point](#kizlo-extension-point) below). The emitted standard service must declare and assign a `kizlo` field so callers reach `wordpress.<resource-plural>.kizlo.<method>(...)`.

The `kizlo/` directory and everything inside it is OUT OF SCOPE for this skill — never read, generate, or modify files there. Treat it as opaque: detect its existence to decide whether to wire the field, nothing more.

### 3. Emit `service.ts`

Use this exact template (substitute `<Resource>` with the PascalCase resource name and `<resource-plural>` with the REST URL path). The class is named `<Resource>Service`.

If `kizlo/` exists, also include the **kizlo wiring** lines marked with `// ← kizlo:` comments (remove the comments themselves, they're just markers for this template). If `kizlo/` does not exist, omit those lines entirely.

```ts
import { WP_CORE_BASE } from "../constants"
import type { WordPressService } from "../service"
import { <Resource>KizloService } from "./kizlo/service" // ← kizlo: only if kizlo/ exists
import type {
	WP_<Resource>,
	WP_<Resource>CreateErrorCode,
	WP_<Resource>CreateInput,
	WP_<Resource>DeleteErrorCode,
	WP_<Resource>DeleteInput,
	WP_<Resource>DeleteResponse,
	WP_<Resource>ListErrorCode,
	WP_<Resource>ListInput,
	WP_<Resource>RetrieveErrorCode,
	WP_<Resource>RetrieveInput,
	WP_<Resource>UpdateErrorCode,
	WP_<Resource>UpdateInput,
} from "./types"

export class <Resource>Service {
	public readonly kizlo: <Resource>KizloService // ← kizlo: only if kizlo/ exists

	constructor(private readonly wordpress: WordPressService) {
		this.kizlo = new <Resource>KizloService(wordpress) // ← kizlo: only if kizlo/ exists
	}

	public async list(input: WP_<Resource>ListInput) {
		const { ...searchParams } = input

		const result = await this.wordpress.get<WP_<Resource>[], WP_<Resource>ListErrorCode>("/<resource-plural>", {
			base: WP_CORE_BASE,
			searchParams,
		})

		if (result.error) return result

		return {
			...result,
			data: this.wordpress.resolveList({ data: result.data, headers: result.headers, searchParams }),
		}
	}

	public async create(input: WP_<Resource>CreateInput) {
		return this.wordpress.post<WP_<Resource>, WP_<Resource>CreateErrorCode>("/<resource-plural>", {
			base: WP_CORE_BASE,
			body: input,
		})
	}

	public async get(input: WP_<Resource>RetrieveInput) {
		const { id, ...searchParams } = input

		return this.wordpress.get<WP_<Resource>, WP_<Resource>RetrieveErrorCode>(`/<resource-plural>/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}

	public async update(input: WP_<Resource>UpdateInput) {
		const { id, ...body } = input

		return this.wordpress.post<WP_<Resource>, WP_<Resource>UpdateErrorCode>(`/<resource-plural>/${id}`, {
			base: WP_CORE_BASE,
			body,
		})
	}

	public async delete(input: WP_<Resource>DeleteInput) {
		const { id, ...searchParams } = input

		return this.wordpress.delete<WP_<Resource>DeleteResponse, WP_<Resource>DeleteErrorCode>(`/<resource-plural>/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}
}
```

**Load-bearing details:**

- **`list` uses `const { ...searchParams } = input`** — looks like a no-op, but it isn't. Passing a named interface directly to `searchParams: SearchParamsLike` (which is `Record<string, unknown>`) fails type-checking because interfaces don't carry an index signature. Rest-destructuring produces an anonymous type that's assignable. Retrieve/update/delete get this for free because they also destructure `id`; `list` has no path param, so the rest-spread is there purely to widen the type.
- **`update` uses POST**, not PUT or PATCH — the WP REST API mutates resources via `POST /<resource>/<id>`. Do not use `wordpress.put` or `wordpress.patch`.
- **`delete` response type** is the union `WP_<Resource>DeleteResponse` (typically `WP_<Resource> | { deleted: true; previous: WP_<Resource> }`), reflecting the `force=true` vs trashed paths.
- **`list` early-returns `result` on error** thanks to `WP_Result`'s discriminated union (`if (result.error) return result`), then wraps the array via `resolveList` for pagination metadata. Do not call `resolveList` with `data: []` on error — it would mask a real failure with an empty page.
- **No path prefix manipulation** — paths are written `/<resource-plural>` and `/<resource-plural>/${id}`. `WP_CORE_BASE` is added by the WordPress service.
- **Method ordering** is fixed: `list`, `create`, `get`, `update`, `delete` (matches the type section ordering in `types.ts`).
- **Imports** stay alphabetized within the type group; keep the `WP_CORE_BASE` value import and the `WordPressService` type import at the top.
- **Kizlo wiring uses constructor body**, not a class-field initializer. `public readonly kizlo = new <Resource>KizloService(this.wordpress)` would read `this.wordpress` BEFORE the parameter property is assigned (class fields initialize before parameter property assignments execute), leaving the kizlo service with an undefined transport. Declare the field, assign in the constructor body using the local `wordpress` parameter.

### 4. Register the service on `WordPressService`

A generated `<Resource>Service` is orphaned until it's exposed on the top-level `WordPressService` in `packages/kizlo/src/wordpress/service.ts`. After writing the service file, make two edits to `service.ts`:

1. Add the import alongside the existing resource imports:
   ```ts
   import { <Resource>Service } from "./<resource-dir>/service"
   ```
2. Add a public readonly field on the class, next to the existing `comments` line:
   ```ts
   public readonly <resource-plural> = new <Resource>Service(this)
   ```

Pluralization for the field name matches the URL path slug (`comments`, `posts`, `users`, `media`, `categories`, `tags`). For singletons (`settings`, `search`), use the singular.

Example for a `Post` resource:
```ts
import { PostService } from "./post/service"
// ...
export class WordPressService {
    public readonly comments = new CommentService(this)
    public readonly posts = new PostService(this)
    // ...
}
```

After this step, callers reach the new service as `wordpress.posts.list(...)`.

### 5. Skip absent endpoints

If `types.ts` only exports a subset (e.g. `settings` is retrieve+update only), only emit the methods that have backing types. Remove the unused imports.

### 6. Verify before reporting done

After writing:

- Run `pnpm --filter kizlo exec tsc --noEmit` and grep for the path of the new service. Zero errors there.
- Confirm method count matches endpoint count from `types.ts`.

Report a short table: endpoints discovered, methods emitted, methods skipped.

## Kizlo extension point

Some resources have a sibling `kizlo/` directory next to `types.ts` and `service.ts` (e.g. `wordpress/user/kizlo/`). This is where hand-written transport methods for the project's custom WP plugin endpoints live — endpoints under `WP_KIZLO_BASE` that don't exist in the standard WP REST API and therefore don't belong in the skill-managed `types.ts`/`service.ts`.

Contract:

- The skill detects `kizlo/` and wires `public readonly kizlo: <Resource>KizloService` onto the standard `<Resource>Service`. Nothing else.
- The skill NEVER reads, writes, or analyzes anything inside `kizlo/`. Naming, types, methods, error codes there are entirely outside this skill's surface area.
- Custom types inside `kizlo/types.ts` do NOT use the `WP_` prefix (that's reserved for raw WP REST mirrors). They typically use `Kizlo<Resource>*` naming, but this skill does not enforce or generate it.
- Callers reach custom methods as `wordpress.<resource-plural>.kizlo.<method>(...)`.

If the user asks this skill to "regenerate" or "update" a service that has a sibling `kizlo/`, regenerate ONLY the standard `service.ts` (with the kizlo wiring lines). Leave `kizlo/` untouched.

## Out of scope

- Domain mapping, validation, business logic, error-code-to-domain-error translation — those live in a higher layer.
- Changing `types.ts`, `WordPressService`, or `service.interface.ts`.
- Generating a `service.interface.ts` or repository class — those are separate concerns the user composes manually.
- Anything inside a sibling `kizlo/` directory — see [Kizlo extension point](#kizlo-extension-point).

## Reference

The canonical output is `packages/kizlo/src/wordpress/comment/service.ts`, generated from `packages/kizlo/src/wordpress/comment/types.ts`. New services should match its shape exactly.

The canonical kizlo-wired output is `packages/kizlo/src/wordpress/user/service.ts`, paired with the hand-maintained `packages/kizlo/src/wordpress/user/kizlo/` directory.