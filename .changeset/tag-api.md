---
"kizlo": minor
---

Add a public tag API (`tags.list` and `tags.get`).

`tags.list` is a lenient public listing over the `post_tag` taxonomy with camelCase filters (`search`, `include`/`exclude`, `order`/`orderBy`, `hideEmpty`, `post`, `slug`). `tags.get` resolves a tag by either id or slug and carries the resolved SEO block. Each tag exposes `id`, `name`, `slug`, `url`, `description`, `postCount`, `seo`, and `meta`, reshaped from the raw WordPress term (WP internals like `taxonomy` and `_links` are dropped, `description` is nulled when empty). Tags are non-hierarchical, so there is no `parent` field or `parent` filter.
