---
"kizlo": minor
---

Restructure the template manifest into `config` (apiPath, alias, kizloPath), `init` (requires, notes), `create` (bootstrap command/prompts), and `changes` (base/create/init), replace `detect`/`requires` with a single `init.requires` array of `{ kind: "dep" | "dir", values, match }` preconditions, and adapt template paths to the project's `src/` convention instead of a per-framework route directory
