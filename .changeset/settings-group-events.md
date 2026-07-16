---
"kizlo": minor
---

Replace the single `settings.saved` webhook event with per-group events so consumers can react to a specific settings change. Flat groups emit `settings.site.updated`, `settings.brand.updated`, `settings.identity.updated`, `settings.authors.updated`, `settings.crawling.updated`, and `settings.integration.updated` with a `null` payload. The keyed groups emit `settings.post_type.updated` and `settings.taxonomy.updated` with a `{ key }` payload naming the changed entry.

This is a breaking change to the event surface: handlers switching on `settings.saved` no longer match. The Next.js revalidation integration now refreshes the robots cache only on `settings.crawling.updated` and `settings.site.updated` instead of every settings change.
