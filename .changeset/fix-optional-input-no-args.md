---
"kizlo": patch
---

Fix calling an `api`-scoped procedure with no arguments throwing "Input validation failed" when every input part is optional — e.g. `client.posts.list.call()` now works without passing an empty `{}`. Procedures with a required `params`/`query`/`body` part still validate as before.