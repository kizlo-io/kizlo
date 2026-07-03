---
"kizlo": patch
"@kizlo/shared": patch
"@kizlo/cf7": patch
---

Fix the server-to-server client losing procedure output types. Calls like `client.posts.list()` and `client.seo.robots()` now resolve `data` to the procedure's real output type instead of `any`.
