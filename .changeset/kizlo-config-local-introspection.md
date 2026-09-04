---
"kizlo": minor
---

Redesign `kizlo.config`: local WordPress moves under `local`, and the generated file is named `introspection.ts`

Migrate: `dev`/`test` → `local.dev`/`local.test`, `name`/`worktrees` → `local.name`/`local.worktrees`, `wordpressClientDir: "."` → `dir: { introspection: "." }`. The test stack now inherits the dev stack's `version` and `fixtures`. Rename the generated `wordpress.ts` to `introspection.ts`. Removed keys fail config validation with the replacement to use.
