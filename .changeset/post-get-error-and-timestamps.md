---
"kizlo": patch
---

Fix a few correctness issues in the posts API:

- Fetching a post by an unknown slug now returns a 404 (`POST_NOT_FOUND`) instead of a 500. The custom post-type route's `post_type_not_found` and `invalid_post_type` error codes are now handled in `posts.get`, and the `PostTypeService` error-code unions widen the WordPress core codes to include them.
- Posts with a null or unparseable publish date no longer fail output validation. `createdAt` now falls back to the modified date rather than producing a `NaN` timestamp.
- The `kizlo` enrichment type now marks `categories`, `tags`, and `author` as optional, matching what the plugin actually returns (it omits these when empty), so the deserializer's guards match the type.
