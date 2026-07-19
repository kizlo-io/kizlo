---
"kizlo": minor
---

Add a public category API (`categories.list` and `categories.get`).

`categories.list` is a lenient public listing over the category taxonomy with camelCase filters (`search`, `include`/`exclude`, `order`/`orderBy`, `hideEmpty`, `parent`, `post`, `slug`). `categories.get` resolves a category by either id or slug and carries the resolved SEO block. Each category exposes `id`, `name`, `slug`, `url`, `description`, `parent`, `postCount`, `seo`, and `meta`, reshaped from the raw WordPress term (WP internals like `taxonomy` and `_links` are dropped, `parent`/`description` are nulled when empty).
