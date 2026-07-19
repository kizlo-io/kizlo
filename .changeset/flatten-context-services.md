---
"kizlo": minor
---

Flatten service clients onto the procedure context and rename `ServerContext` to `ProcedureContext`.

The `service` wrapper is gone from the handler context. Its members now live directly on the context: `context.service.wordpress` becomes `context.wordpress`, `context.service.settings` becomes `context.settings`, and `context.service.email` becomes `context.email`. Update any custom procedures or extensions accordingly.

The context type is renamed from `ServerContext` to `ProcedureContext` — the single type every procedure, middleware, event, and webhook handler receives. A procedure handler still gets this base plus whatever its middleware injected via `next({ context })`.

The `Service` class and its `ServiceConfig` type are no longer exported from `kizlo`. `EmailService` and `SettingsService` are now constructed from a `WordPressService` directly instead of the removed `Service` aggregate.
