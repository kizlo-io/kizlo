---
"kizlo": minor
---

Menu API improvements and fixes.

Output (`MenuItem` / group items) additions:

- `parent`: the parent menu-item id (`null` at the top level), so the flat list can be assembled into a hierarchy without the group endpoint.
- `target`: the link target (`"_blank"` or `""`), for rendering `<a target>`.
- `objectId`: the id of the linked post or term, to correlate a nav item back to its source resource.
- `order`: the item's sort position (WordPress' `menu_order`), so the flat list can be ordered without the group endpoint.
- `classes`: editor-assigned CSS classes (WordPress' empty-class `[""]` quirk filtered out), for theme styling hooks.
- `attrTitle`: the link's `title` attribute text.
- `xfn`: the anchor's XFN `rel` relationships (empty entries filtered out).
- `invalid`: whether the linked object no longer exists, so broken links can be hidden or badged.

List input (`menus.items.list` / `menus.group`) changes:

- Invalid list query values are now tolerated instead of throwing: each filter falls back to being ignored, and an invalid `page` falls back to `1`. Listing surfaces degrade gracefully rather than returning a 400.
- `perPage` is bounded to 1-100 and `offset` to a non-negative integer.
- `searchColumns` is constrained to `post_title`/`post_content`/`post_excerpt`.
- An `orderby` that WordPress would reject for a missing companion (`relevance` without `search`, `include` without `include`, `include_slugs` without `slug`) is now dropped so the list falls back to default ordering instead of returning a 400.

Fixes:

- A menu item whose linked `object` is a non-standard type (any custom post type or taxonomy, `tag`, etc.) no longer fails output validation with a 500. The item `type` is now a permissive string.
- `href` now returns the full path instead of only the last URL segment, so nested targets (e.g. `/about-us/team`) are no longer truncated to their leaf. Custom links keep the authored value (including absolute external URLs), and an internal path resolves to the same `href` whether the item is a custom link or a linked page.
