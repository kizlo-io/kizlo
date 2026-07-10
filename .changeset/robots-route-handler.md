---
"kizlo": patch
---

Add `createRobotsRoute` (exported from `kizlo/nextjs/server`) to serve `robots.txt` from a route handler instead of Next's `robots.ts` metadata convention. Metadata routes are not reachable by `revalidatePath("/robots.txt")`, so robots.txt never refreshed on content or settings changes; a route handler mounted at `app/robots.txt/route.ts` does. Mirrors the existing `createSitemapRoute`.

`nextRevalidation` now also revalidates the global SEO surfaces on `settings.*` events, so settings changes refresh `/robots.txt` and the sitemap (both derived from settings) instead of being dropped.

Fix sitemap revalidation: `nextRevalidation` now revalidates the sitemap route as a `layout` instead of a `page`. The `[sitemap]` route has no `generateStaticParams`, so its slugs (`index.xml`, each `{key}.xml`, `-{n}` pages) are generated on-demand; a `page` revalidation of the pattern never reached those concrete entries, so the sitemap stayed stale. A `layout` revalidation invalidates the whole `/sitemaps` subtree and refreshes them all at once.
