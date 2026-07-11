---
"kizlo": patch
---

Improve sitemap route caching to match the robots.txt approach. `createSitemapRoute` (Next integration) now caches its WordPress-backed bodies with `unstable_cache` under a `kizlo:sitemap` tag, keyed per slug, and `nextRevalidation` refreshes that tag on content events. The scaffolded route is `force-dynamic`, so Vercel does not bake `/sitemaps/index.xml` into an immutable Edge CDN asset that on-demand `revalidatePath` cannot reach. Requests stay cheap (the WordPress calls are cached) while the index and collection sitemaps stay current on content changes.
