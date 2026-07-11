---
"kizlo": patch
---

Make the runtime edge-compatible. Dropped `node:crypto` and `Buffer` from the package barrel (the `altcha` adapter and the WordPress auth header now use Web Crypto and `btoa`/`atob`), so `kizlo` builds and runs on Node, edge, and other serverless runtimes.
