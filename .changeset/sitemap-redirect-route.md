---
"kizlo": minor
---

Add `createSitemapRedirectRoute`, a framework-agnostic handler that permanently redirects the well-known `/sitemap.xml` to the generated sitemap index at `/sitemaps/index.xml`. Many crawlers ignore robots.txt and probe the standard path directly, so this points them at the real index. It is a static 308 with no WordPress call, derived from the same `SITEMAP_BASE`/`SITEMAP_INDEX_SLUG` constants the sitemap route is mounted on. `kizlo init` now scaffolds a `sitemap.xml` route for the Next.js preset.

The sitemap index path is now fixed at `/sitemaps/index.xml` and is no longer configurable. `KizloCrawlingSettings` no longer includes the `sitemaps.pathname_structure` field.
