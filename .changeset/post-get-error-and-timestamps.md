---
"kizlo": minor
---

Posts API improvements and fixes.

Output (`Post`) additions:

- `url`: the post's resolved public URL, built by the plugin from the Kizlo site-URL setting (not WordPress' home URL).
- `parent`: parent post ID for hierarchical types (null for flat types like `post`).
- `preview`: whether the record was returned through the preview-token flow.
- `status`: the post status (`publish`/`future`/`draft`/`pending`/`private`), useful for rendering preview badges. The WP-internal `trash` status is normalized to `draft`.
- `author.slug`: the author's nicename, needed to build author archive links.
- `featuredMedia` now carries `width`, `height`, `mime`, responsive `variants`, and a ready-to-use `srcset` string (via the plugin's shared media resolver), so it can back `next/image` or a plain `<img srcset>` without layout shift.
- `title` is now `null` for posts with an empty title instead of an empty string.

List input (`posts.list`) changes:

- Invalid list query values are now tolerated instead of throwing: each filter falls back to being ignored, and an invalid `page` falls back to `1`. Listing surfaces degrade gracefully rather than returning a 400. (`posts.get` and future writes stay strict.)
- `perPage` is bounded to 1-100 (WordPress' own cap) and `offset` to a non-negative integer.
- `searchColumns` is constrained to `post_title`/`post_content`/`post_excerpt`.
- `orderby` gains `modified`, pairing with the `updatedAt` output for "recently updated" ordering. An `orderby` that WordPress would reject for a missing companion (`relevance` without `search`, `include` without `include`) is now dropped so the list falls back to default ordering instead of returning a 400. The `POST_SEARCH_REQUIRED` and `POST_ORDERBY_INCLUDE_MISSING` list errors are removed as a result.
- Added `modifiedAfter`/`modifiedBefore` date filters for incremental sync / ISR revalidation ("posts changed since X").

Fixes:

- `posts.get` now returns `POST_NOT_FOUND` for non-published posts unless a valid preview token is supplied. The underlying WordPress fetch runs with edit context and admin credentials, so without this guard an anonymous caller could read `draft`/`private`/`pending`/`future`/`trash` content by id. The preview-token flow remains the only way to read unpublished posts.
- Fetching a post by an unknown slug now returns a 404 (`POST_NOT_FOUND`) instead of a 500. The custom post-type route's `post_type_not_found` and `invalid_post_type` error codes are handled in `posts.get`, and the `PostTypeService` error-code unions widen the WordPress core codes to include them.
- `createdAt`/`updatedAt` are derived from the GMT date fields (parsed as UTC) instead of the site-local fields, fixing a timezone drift that depended on where the server ran. Posts with a null or unparseable date no longer fail output validation with a `NaN` timestamp.
- The `kizlo` enrichment type marks `url`/`categories`/`tags`/`author`/`featured_media` as optional, matching what the plugin actually returns.
