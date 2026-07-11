---
"kizlo": patch
---

Run the scaffolded sitemap route on the edge. The Next.js CLI preset now emits `export const runtime = "edge"` for `/sitemaps/[sitemap]`, matching the robots.txt route, so both special-file responses run on the cheaper, faster edge runtime instead of Node.