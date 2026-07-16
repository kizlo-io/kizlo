---
"@kizlo/shared": patch
---

Normalize the public barrel to the wildcard export convention, mark the package `sideEffects: false` for tree-shaking, and drop the unused `html-entities` and `@types/js-cookie` dev dependencies. Internal cleanup with no runtime behaviour change; the type-level `Duration` alias is now re-exported alongside the existing surface.
