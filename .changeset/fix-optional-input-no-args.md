---
"kizlo": patch
---

Fix `api`-scoped procedures whose input parts are all optional throwing "Input validation failed" when called with no arguments — `client.posts.list.call()` now works without passing `{}`. Procedures with a required `params`/`query`/`body` still validate.