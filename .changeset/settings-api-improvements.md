---
"@kizlo/shared": minor
"kizlo": minor
---

Settings API improvements.

- Removed the `publicly_queryable` field from post type and taxonomy settings. It was a read-only runtime value that the server silently ignored on write, so it never belonged on the writable surface. It is gone from the `PostTypeSettings`/`TaxonomySettings` types, from the `settings` response, and from the update inputs.
- The settings update router is now nested per section: `settings.updateSite` becomes `settings.site.update` (and likewise `brand`, `identity`, `authors`, `crawling`, `webhook`, `uploads`, `postType`, `taxonomy`). This leaves room to add per-section reads such as `settings.site.get` later.
- Settings update calls now return the saved section instead of `null`, so callers can read back the persisted, fully-resolved state (media ids resolved to `{ id, src }` objects) without a follow-up `get`. Each update is typed to its section: `site.update` returns `SiteSettings`, `postType.update` returns the single updated `PostTypeSettings`, and so on.
- A WordPress `rest_forbidden` (403) from a settings write now surfaces as a `FORBIDDEN` error instead of a generic 500.
