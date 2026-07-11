---
"kizlo": patch
---

Fix the sitemap index freezing in production. `createSitemapRoute` (Next integration) now caches its WordPress-backed bodies with `unstable_cache` under a `kizlo:sitemap` tag, keyed per slug, and `nextRevalidation` refreshes that tag on content events. Paired with the app route switching to `force-dynamic`, this stops Vercel from baking `/sitemaps/index.xml` onto its Edge CDN as an immutable asset — a bake that `revalidatePath` can't purge, which left the index stuck showing only non-WordPress `extra` entries (and a build-time `localhost` origin) even as the on-demand collection sitemaps refreshed fine. Mirrors the robots.txt caching approach.
