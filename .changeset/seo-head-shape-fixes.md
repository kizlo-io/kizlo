---
"kizlo": minor
---

SEO head shape fixes and additions.

The `seo.homepage` output and the `seo` block embedded in `posts.get` are built from the same reshape (`deserializeSeo`), which is now the single source of truth. Several fields the plugin omits or types differently were mismatched against the schema and could fail output validation with a 500:

- `og.image.width` / `og.image.height` are numbers (not strings) and may be `null`; `og.image.type` may be `null`. Any page carrying an Open Graph image previously risked a 500.
- `og.description`, `twitter.description`, and every `article.*` field are omitted by the plugin when empty; they now degrade to `""` instead of producing an invalid `undefined`.
- `twitter.card` is now correctly typed as `"summary" | "summary_large_image"`.

Additions:

- `twitter.imageAlt` is now exposed (rendered as the Twitter card image alt).
- `article.tags` is now exposed (maps to `article:tag` Open Graph meta tags).
