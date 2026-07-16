---
"@kizlo/cf7": patch
---

Mark the package `sideEffects: false` for tree-shaking and drop unused internal code (the `SubmitFormInput` schema and the `CF7ServiceInterface`, `WP_SubmitCF7Input`, and `WP_SubmitCF7Result` types). Internal cleanup with no runtime behaviour change; the public surface is unchanged.
