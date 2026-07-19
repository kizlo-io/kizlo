---
"kizlo": patch
---

Menu API robustness fixes.

List input (`menus.items.list` / `menus.group`) changes:

- Invalid list query values are now tolerated instead of throwing: each filter falls back to being ignored, and an invalid `page` falls back to `1`. Listing surfaces degrade gracefully rather than returning a 400.
- `perPage` is bounded to 1-100 and `offset` to a non-negative integer.
- `searchColumns` is constrained to `post_title`/`post_content`/`post_excerpt`.
- An `orderby` that WordPress would reject for a missing companion (`relevance` without `search`, `include` without `include`, `include_slugs` without `slug`) is now dropped so the list falls back to default ordering instead of returning a 400.

Fixes:

- A menu item whose linked `object` is a non-standard type (any custom post type or taxonomy, `tag`, etc.) no longer fails output validation with a 500. The item `type` is now a permissive string.
