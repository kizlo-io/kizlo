---
"kizlo": minor
---

Fix `localhost` URLs in the sitemap index. The index `<loc>`s were built from the request origin, which resolves to `localhost` when the route is served as a prebuilt static file (`dynamic = "force-static"`), so the deployed sitemap pointed at localhost. The origin now comes from WordPress via a new `client.seo.sitemaps.index()` (the entry list plus the canonical origin resolved from the Kizlo site URL), so both the index and any `extra` sitemap URLs stay canonical. `client.seo.sitemaps()` is now `client.seo.sitemaps.list()`.
