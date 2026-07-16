# Cleanup plan

A repeatable cleanup pass for a single **target** (one package or plugin).

Usage: reference this file and name a target, e.g. "run CLEANUP.md against `shared`".

## Rules

- **One target, one PR.**
- **Baseline first.** Capture the before-state, clean, then re-verify against the same commands.
- Pre-existing red (failing before you start) is not part of this pass. Note it, open a separate issue.

## Sequence

### 0. Baseline

Capture before touching anything:

```
pnpm --filter <target> typecheck
pnpm --filter <target> test
pnpm --filter <target> build
pnpm check
```

### A. Dedupe (Fallow `dupes`)

- `npx fallow dupes` scoped to the target.
- Identical logic in 2+ spots -> collapse.
- If the duplicated logic is generic enough to belong outside the target, hand it to Workstream C instead of collapsing locally.

### C. Utils consolidation (before B)

Do C before B: moving a util changes what each file imports/exports, which changes B's answers.

- Find helpers used in 2+ files but living ad-hoc (inline helpers, a stray `utils.ts`, a `foo/utils` file).
- Home by scope:
  - Used only inside one module -> leave it.
  - Used across modules within the target -> the target's own `shared/` folder.
  - Generic and useful beyond the target -> `@kizlo/shared/src/<domain>.ts`. Match the flat domain-file pattern (`url.ts`, `time.ts`, `result.ts`). No `utils/` dumping folder.
- Move -> update imports -> add to the barrel per Workstream D.

### B. Dead code (Fallow `dead-code`)

- `npx fallow dead-code`: unused files, exports, deps.
- Delete unused files, internal symbols, and deps.
- Under the wildcard convention, do **not** chase "unused export" warnings on the public barrel. Exporting everything for consumers is intentional.

### D. Comments + exports

**Comments (strict)**

- Remove every prose `//` line comment and `/* */` block comment: what-it-does restatements, why-notes, and dead commented-out code alike. Delete them; never promote a `//` comment to JSDoc to preserve it.
- Keep section-separator banners (`// ==== NAME ====`) that accurately label the block beneath them. Fix a label that has drifted from its code; drop a banner only when it is stale or when the file is too trivial to section (e.g. a flat wildcard barrel).
- Keep: existing JSDoc `/** */`, functional pragmas (`biome-ignore`, `@ts-expect-error`, `@ts-ignore`), shebangs, license headers.

**Exports (wildcard convention)**

- Every public `index.ts`: `export * from "./x"` for values, `export type * from "./x"` for type-only modules. Uniform, no mixing.
- Kill redundant round-trips (e.g. `import type { X } ... export type { X }` -> a direct `export type * from "./..."`).
- Control visibility at the **file level**: if something should not be public, do not export it from its own module. The barrel wildcards whatever the module exposes.
- If the target is a factory-only extension (no barrel), skip this step. It is already consistent.

### Tree-shaking fix

- Ensure `package.json` has `"sideEffects": false`.
- If the target has a genuinely side-effectful entry (e.g. a CLI), use the array form: `"sideEffects": ["./dist/cli/**"]`.
- This is what protects tree-shaking under wildcard barrels. Do it in the same PR as the export normalization.

### 6. Re-verify

- `typecheck` -> `test` (incl. `.test-d.ts`) -> `build` -> `check`.
- Diff vs. baseline: same-or-fewer failures, never more.
- Add `publint` + `attw` since exports and `sideEffects` changed. They catch broken `exports`/type resolution that tests miss.
- Add a changeset if the public surface moved.

## If the target is a PHP plugin

- Verify via PHPStan through `pnpm typecheck`.
- Changelog via `composer changelog add`. Never changesets, never hand-edit `CHANGELOG.md`.
- Biome and Fallow do not cover PHP. Skip the JS-only workstreams.

## Tooling summary

| Concern | Tool |
| --- | --- |
| Dead code, dupes, complexity | Fallow (`dead-code`, `dupes`, `health`) |
| Format, style, import order | Biome |
| Workspace dep drift | sherif (`pnpm lint:ws`) |
| Package exports / type resolution | publint + `@arethetypeswrong/cli` |
| PHP | PHPStan (via `pnpm typecheck`) |