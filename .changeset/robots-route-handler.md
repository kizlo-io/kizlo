---
"kizlo": minor
---

Add `createRobotsRoute` (from `kizlo/nextjs/server`) to serve `robots.txt` from a route handler instead of Next's `robots.ts` metadata convention, which `revalidatePath("/robots.txt")` cannot reach. Mirrors `createSitemapRoute`.

`nextRevalidation` now also revalidates SEO surfaces on `settings.*` events, so settings changes refresh `/robots.txt` and the sitemap.

Fix sitemap revalidation: revalidate the `[sitemap]` route as a `layout` instead of a `page`, so on-demand slugs (no `generateStaticParams`) actually refresh.