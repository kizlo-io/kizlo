---
"kizlo": minor
---

Type the browser client from a procedure registry so `ActiveKizloClient` is importable without holding the client. Run `kizlo generate` after upgrading: a barrel written by an earlier version no longer registers its procedures, and the client resolves to `any` until it is regenerated.
